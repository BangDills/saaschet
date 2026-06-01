import { NextResponse } from "next/server";
import { createOpenAI } from "@ai-sdk/openai";
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from "ai";
import { defaultModelId } from "@/lib/chat/models";
import { searchWeb, formatSearchResults } from "@/lib/chat/web-search";
import { deriveTitle } from "@/lib/chat/storage";
import { createClient } from "@/lib/supabase/server";
import { fetchRepoBundle, parseRepoSlug } from "@/lib/github/client";
import { formatRepoForContext } from "@/lib/github/format";
import {
  createAgentTools,
  generateWorkBranchName,
} from "@/lib/agent/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Agent loops can run multi-step; bump the function timeout on Vercel.
export const maxDuration = 120;

const DO_BASE_URL =
  process.env.DO_INFERENCE_BASE_URL ?? "https://inference.do-ai.run/v1";

const DEFAULT_SYSTEM = `You are Horizon AI, a helpful, concise assistant. \
Use Markdown for formatting and triple-backtick code blocks with language \
tags for code.`;

const AGENT_SYSTEM = `You are Horizon AI in **Agent Mode**. You have access to \
GitHub-based tools that let you read, search, and edit files in the user's \
connected repository, and to search the public web. \

Operating principles:
- ALWAYS read a file with read_file before overwriting it with write_file. \
  Never invent paths or content.
- Use list_files / search_code to discover what's in the repo before reading. \
  If list_files returns 'Repository is empty (no commits yet)', skip read_file \
  and go straight to write_file — the first write will bootstrap the repo.
- write_file commits to a NEW feature branch automatically — never to the \
  default branch directly. EXCEPTION: when the repo is empty and has no \
  commits yet, write_file will commit to the default branch as the bootstrap \
  commit (you'll see a 'note' field in the result confirming this). In that \
  case, do NOT call create_pull_request afterward — there is no diff to PR.
- Group related changes under one logical commit message each.
- After all writes are done in a NORMAL repo (not empty bootstrap), call \
  create_pull_request with a clear title and Markdown body summarizing the \
  changes. Do NOT skip this step when the user asked for a change to be \
  applied to an existing repo.
- If the request is read-only ("explain", "find", "what does X do"), don't \
  write or open a PR. Just answer.
- When you finish, give the user a short summary of what you did, including \
  the PR URL when one was created (or noting that the change went straight \
  to main when the repo was empty).
- Use Markdown formatting in your final answer with triple-backtick code \
  blocks and language tags.`;

type ChatRequestBody = {
  messages: UIMessage[];
  model?: string;
  /** UUID generated client-side; server uses it to upsert the conversation row. */
  conversationId: string;
  /** When true, run web search on the latest user message and prepend results. */
  webSearch?: boolean;
  /** "owner/repo" — when set, the repo's README + manifest + tree is
   *  injected as context. Also persisted onto the conversation row. */
  repo?: string | null;
  /** When true, the model gets access to GitHub read+write + web tools and
   *  can call them in a multi-step loop. Requires `repo` to be set. */
  agentMode?: boolean;
  /** Optional system prompt override. */
  system?: string;
};

function partsToText(parts: UIMessage["parts"] | undefined): string {
  if (!parts) return "";
  return parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .filter(Boolean)
    .join("");
}

function lastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const text = partsToText(m.parts);
    if (text.trim()) return text;
  }
  return "";
}

export async function POST(req: Request) {
  // ── Auth ─────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to chat. Your session has expired." },
      { status: 401 },
    );
  }

  // ── Inference key check ──────────────────────────────────────────────
  const apiKey = process.env.DO_INFERENCE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "DO_INFERENCE_API_KEY is not set. Add it to your environment variables.",
      },
      { status: 500 },
    );
  }

  // ── Parse body ───────────────────────────────────────────────────────
  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messages = body.messages ?? [];
  const modelId = body.model || defaultModelId;
  const wantsWebSearch = body.webSearch === true;
  const conversationId = body.conversationId;
  const repoSlug = body.repo?.trim() || null;
  const wantsAgent = body.agentMode === true;

  if (!conversationId) {
    return NextResponse.json(
      { error: "conversationId is required" },
      { status: 400 },
    );
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "messages must be a non-empty array" },
      { status: 400 },
    );
  }

  // Agent mode is only meaningful when a repo is connected.
  if (wantsAgent && !repoSlug) {
    return NextResponse.json(
      {
        error:
          "Agent Mode requires a connected GitHub repository. Use 'Select repo' first.",
      },
      { status: 400 },
    );
  }

  const userText = lastUserText(messages);

  // ── Look up GitHub token (used by both context fetch + agent tools) ──
  const { data: profile } = await supabase
    .from("profiles")
    .select("github_token")
    .eq("id", user.id)
    .maybeSingle();
  const githubToken: string | undefined = profile?.github_token ?? undefined;

  if (wantsAgent && !githubToken) {
    return NextResponse.json(
      {
        error:
          "Agent Mode requires you to sign in with GitHub so I can read and write to the repo on your behalf.",
      },
      { status: 400 },
    );
  }

  // ── Upsert conversation ──────────────────────────────────────────────
  const { data: existingConv } = await supabase
    .from("conversations")
    .select("id, title")
    .eq("id", conversationId)
    .maybeSingle();

  if (!existingConv) {
    const { error: insertErr } = await supabase.from("conversations").insert({
      id: conversationId,
      user_id: user.id,
      title: deriveTitle(userText),
      model_id: modelId,
      github_repo: repoSlug,
    });
    if (insertErr) {
      return NextResponse.json(
        { error: `Failed to create conversation: ${insertErr.message}` },
        { status: 500 },
      );
    }
  } else {
    await supabase
      .from("conversations")
      .update({
        model_id: modelId,
        github_repo: repoSlug,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);
  }

  // ── Insert user message ──────────────────────────────────────────────
  const { error: userMsgErr } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    role: "user",
    content: userText,
  });
  if (userMsgErr) {
    return NextResponse.json(
      { error: `Failed to save user message: ${userMsgErr.message}` },
      { status: 500 },
    );
  }

  // ── Build system prompt ──────────────────────────────────────────────
  let system =
    body.system?.trim() || (wantsAgent ? AGENT_SYSTEM : DEFAULT_SYSTEM);

  // Web search context (chat mode only — agent has the web_search tool).
  if (wantsWebSearch && !wantsAgent) {
    const tavilyKey = process.env.TAVILY_API_KEY;
    if (tavilyKey && userText) {
      try {
        const results = await searchWeb(userText, tavilyKey, {
          maxResults: 5,
          includeAnswer: true,
        });
        if (results.results.length > 0) {
          system = `${system}\n\n${formatSearchResults(results)}`;
        }
      } catch (err) {
        console.warn("[chat] web search failed:", err);
      }
    } else if (!tavilyKey) {
      console.warn(
        "[chat] webSearch requested but TAVILY_API_KEY is not set; skipping",
      );
    }
  }

  // Repo context (chat mode only — agent reads with tools as needed).
  if (repoSlug && !wantsAgent) {
    const parsed = parseRepoSlug(repoSlug);
    if (parsed) {
      try {
        const bundle = await fetchRepoBundle(
          parsed.owner,
          parsed.name,
          githubToken,
        );
        system = `${system}\n\n${formatRepoForContext(bundle)}`;
      } catch (err) {
        console.warn("[chat] repo fetch failed:", err);
        system = `${system}\n\nNote: the user wanted ${parsed.owner}/${parsed.name} as repo context but it could not be fetched. Politely tell them the repo is unreachable (private without sufficient OAuth scope, or rate-limited) and continue without it.`;
      }
    }
  }

  // ── Build agent tools (only when wantsAgent) ─────────────────────────
  const tools = wantsAgent
    ? createAgentTools({
        repoSlug: repoSlug!,
        githubToken: githubToken!,
        tavilyKey: process.env.TAVILY_API_KEY ?? null,
        workBranch: generateWorkBranchName(),
        branchesCreated: new Set(),
      })
    : undefined;

  // ── Stream the model response ────────────────────────────────────────
  const digitalocean = createOpenAI({ baseURL: DO_BASE_URL, apiKey });

  try {
    const result = streamText({
      model: digitalocean.chat(modelId),
      system,
      messages: await convertToModelMessages(messages),
      // Agent mode: enable tools + multi-step loop. Cap at 10 steps so a
      // runaway loop can't burn through a user's budget.
      ...(tools
        ? {
            tools,
            stopWhen: stepCountIs(10),
          }
        : {}),
      onFinish: async ({ text }) => {
        const { error: assistantErr } = await supabase.from("messages").insert({
          conversation_id: conversationId,
          role: "assistant",
          content: text,
        });
        if (assistantErr) {
          console.error(
            "[chat] failed to persist assistant message:",
            assistantErr,
          );
        }
        await supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversationId);
      },
    });

    return result.toUIMessageStreamResponse({
      headers: {
        "X-Accel-Buffering": "no",
        "Cache-Control": "no-cache, no-transform",
        "X-Conversation-Id": conversationId,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown inference error";
    return NextResponse.json(
      { error: `Inference failed: ${message}` },
      { status: 502 },
    );
  }
}
