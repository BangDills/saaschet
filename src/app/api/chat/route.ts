import { NextResponse } from "next/server";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { defaultModelId } from "@/lib/chat/models";
import { searchWeb, formatSearchResults } from "@/lib/chat/web-search";
import { deriveTitle } from "@/lib/chat/storage";
import { createClient } from "@/lib/supabase/server";
import { fetchRepoBundle, parseRepoSlug } from "@/lib/github/client";
import { formatRepoForContext } from "@/lib/github/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DO_BASE_URL =
  process.env.DO_INFERENCE_BASE_URL ?? "https://inference.do-ai.run/v1";

const DEFAULT_SYSTEM = `You are Horizon AI, a helpful, concise assistant. \
Use Markdown for formatting and triple-backtick code blocks with language \
tags for code.`;

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

  const userText = lastUserText(messages);

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

  // ── Build system prompt (web search + connected repo) ────────────────
  let system = body.system?.trim() || DEFAULT_SYSTEM;

  if (wantsWebSearch) {
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

  if (repoSlug) {
    const parsed = parseRepoSlug(repoSlug);
    if (parsed) {
      // Use the user's stored GitHub token if they signed in via GitHub
      // OAuth — gives us the higher 5000/h rate limit.
      const { data: profile } = await supabase
        .from("profiles")
        .select("github_token")
        .eq("id", user.id)
        .maybeSingle();
      const ghToken: string | undefined = profile?.github_token ?? undefined;

      try {
        const bundle = await fetchRepoBundle(parsed.owner, parsed.name, ghToken);
        system = `${system}\n\n${formatRepoForContext(bundle)}`;
      } catch (err) {
        console.warn("[chat] repo fetch failed:", err);
        system = `${system}\n\nNote: the user wanted ${parsed.owner}/${parsed.name} as repo context but it could not be fetched. Politely tell them the repo is unreachable (private without sufficient OAuth scope, or rate-limited) and continue without it.`;
      }
    }
  }

  // ── Stream the model response ────────────────────────────────────────
  const digitalocean = createOpenAI({ baseURL: DO_BASE_URL, apiKey });

  try {
    const result = streamText({
      model: digitalocean.chat(modelId),
      system,
      messages: await convertToModelMessages(messages),
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
