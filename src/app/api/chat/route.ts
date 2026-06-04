import { NextResponse } from "next/server";
import { createOpenAI } from "@ai-sdk/openai";
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from "ai";
import {
  defaultModelId,
  resolveProvider,
  stripProviderPrefix,
  PROVIDER_BASE_URLS,
  PROVIDER_ENV_KEYS,
  isAgentCapable,
} from "@/lib/chat/models";
import { needsToolCallTypeFix, toolCallCompatFetch } from "@/lib/chat/kimi-compat";
import { searchWeb, formatSearchResults } from "@/lib/chat/web-search";
import { deriveTitle } from "@/lib/chat/storage";
import { createClient } from "@/lib/supabase/server";
import { fetchRepoBundle, parseRepoSlug } from "@/lib/github/client";
import { formatRepoForContext } from "@/lib/github/format";
import {
  createAgentTools,
  generateWorkBranchName,
} from "@/lib/agent/tools";
import { getDaytonaClient } from "@/lib/daytona/client";
import { createSandboxTools } from "@/lib/daytona/sandbox-tools";
import type { Sandbox } from "@daytona/sdk";
import {
  assertCanSpend,
  recordSpend,
  OutOfCreditsError,
} from "@/lib/credits/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Agent loops can run multi-step; bump the function timeout on Vercel.
// 300s = 5 minutes, the maximum on Vercel Pro. Agent tasks (e.g. creating
// a full landing page) can involve 10–20 tool calls which take time.
export const maxDuration = 300;



const DEFAULT_SYSTEM = `You are **SaaSchet AI**, an advanced, intelligent assistant.

## Core Traits
- You are thoughtful, proactive, and thorough.
- Think step-by-step before answering complex questions.
- Anticipate follow-up questions and address them proactively.
- When unsure, say so honestly rather than guessing.
- Be concise but complete — don't omit important details.

## Communication Style
- Use clear, professional language.
- Use Markdown formatting: headers, bold, lists, tables when helpful.
- Use triple-backtick code blocks with language tags for code.
- Break complex answers into logical sections.
- Summarize key points at the end for long responses.

## Knowledge & Reasoning
- Draw on your full knowledge to give the best answer.
- For technical questions: explain the "why" not just the "how".
- For coding: consider edge cases, error handling, and best practices.
- When asked to compare options, use tables or pros/cons lists.
- If a question has multiple valid interpretations, address the most likely one and mention alternatives.

## Building Projects & Code Output
- **Always create proper project structures** with separate files — NEVER put everything in one file.
- For web projects: separate HTML (index.html), CSS (styles.css), and JS (script.js) at minimum.
- Include a **README.md** with project description, setup instructions, and usage.
- Use modern, clean, well-commented code with proper error handling.
- Follow industry best practices: semantic HTML, BEM/utility CSS, modular JS.
- Add meta tags, proper document structure, and accessibility attributes.
- If creating a larger project, organize with folders: /src, /assets, /styles, /scripts.
- Always create complete, production-ready output — not minimal prototypes.

## Memory & Context
- Pay close attention to the full conversation history.
- Reference earlier messages when relevant ("As you mentioned earlier...").
- Track user preferences and adapt your style accordingly.
- If the user corrects you, learn from it within the conversation.`;

const AGENT_SYSTEM = `You are **SaaSchet AI Agent** — an advanced AI coding assistant with access to GitHub tools and web search. You work autonomously to read, analyze, write, and modify code in the user's repository.

## Identity & Mindset
- You are a senior-level software engineer and pair programmer.
- Think carefully before acting. Plan your approach, then execute.
- Be proactive: if you spot bugs, anti-patterns, or improvements while working, mention them.
- You have strong opinions on code quality but hold them loosely.

## Tool Usage Strategy
1. **Explore first**: Use \`list_files\` (depth: 2-3) and \`search_code\` to understand the repo structure before reading/writing.
2. **Read before writing**: ALWAYS \`read_file\` before modifying. Never invent paths or content.
3. **Prefer surgical edits**: For small changes (rename, fix, add import), use \`edit_file\` instead of \`write_file\`. It's cheaper and safer.
4. **Use \`write_file\`** only for new files or complete rewrites.
5. **Search the web** when you need up-to-date info, docs, or unfamiliar APIs.
6. **Commit logically**: Group related changes under one descriptive commit message (conventional-commit style).

## Branching & PRs
- Writes go to a NEW feature branch automatically — never to main.
- **Exception**: Empty repos (no commits). write_file bootstraps on main. Don't create a PR in that case.
- After all changes are done (in non-empty repos), ALWAYS call \`create_pull_request\` with a clear title and Markdown body.
- Include a summary of changes, files modified, and any important notes in the PR body.

## Code Quality Standards
- Follow the repo's existing code style and conventions.
- Add proper error handling and edge case coverage.
- Write clear commit messages in conventional-commit format.
- If creating new files, follow the project's directory structure and naming patterns.
- Consider backwards compatibility and potential side effects.

## Building Projects (IMPORTANT)
When the user asks you to build a web page, app, tool, or any project:
- **ALWAYS create proper multi-file project structures** — separate HTML, CSS, and JS files.
- **ALWAYS include a README.md** with: project title, description, features, setup/usage instructions.
- For web projects at minimum create: index.html, styles.css, script.js, README.md
- Use modern, clean, well-organized code with clear comments.
- Create **production-quality output**: proper meta tags, responsive design, error handling, accessibility.
- Use semantic HTML5, modern CSS (flexbox/grid, variables, animations), and clean ES6+ JavaScript.
- If the project is larger, organize with folders: /src, /assets, /styles, /scripts.
- Add a .gitignore if relevant.
- **Do NOT put everything in a single file.** Separation of concerns is mandatory.
- Think like a senior engineer: write code you'd be proud to show in a code review.

## Communication
- After finishing, give a clear summary: what you did, why, and the PR URL.
- If something failed or was unexpected, explain what happened and suggest next steps.
- Use Markdown with code blocks (with language tags) in your responses.
- For read-only requests ("explain", "find", "what does X do"), just answer — don't write or open a PR.

## Memory & Context
- Track what you've already read/modified in this conversation.
- Don't re-read files you've already seen unless the user asks for a fresh look.
- Reference your earlier findings when making decisions.
- If the user provides feedback, adapt your approach accordingly.`;

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
  // Keys are resolved dynamically per-provider below.

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

  // Agent mode is automatic: if the model supports tool calling AND
  // a repo is connected, agent tools are enabled.
  const wantsAgent = isAgentCapable(modelId) && !!repoSlug;

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

  // ── Pre-flight: daily credit check ───────────────────────────────────
  const turnKind: "chat" | "agent" = wantsAgent ? "agent" : "chat";
  try {
    await assertCanSpend(user.id, turnKind);
  } catch (err) {
    if (err instanceof OutOfCreditsError) {
      return NextResponse.json(
        {
          error: err.message,
          code: "out_of_credits",
          credits: err.snapshot,
        },
        { status: 402 },
      );
    }
    throw err;
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
      status: "processing",
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
        status: "processing",
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

  // ── Build memory context from recent conversations ──────────────────
  let memoryContext = "";
  try {
    const { data: recentConvs } = await supabase
      .from("conversations")
      .select("id, title, updated_at")
      .eq("user_id", user.id)
      .neq("id", conversationId)
      .order("updated_at", { ascending: false })
      .limit(10);

    if (recentConvs && recentConvs.length > 0) {
      const summaries = recentConvs
        .map((c) => `- "${c.title}" (${new Date(c.updated_at).toLocaleDateString()})`)
        .join("\n");
      memoryContext = `\n\n## Recent Conversation Memory\nThe user has had these recent conversations with you. Use this context to provide continuity and personalized responses:\n${summaries}`;
    }
  } catch (err) {
    console.warn("[chat] failed to fetch memory context:", err);
  }

  // ── Build system prompt ──────────────────────────────────────────────
  let system =
    (body.system?.trim() || (wantsAgent ? AGENT_SYSTEM : DEFAULT_SYSTEM)) +
    memoryContext;

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
  let sandbox: Sandbox | null = null;

  const githubTools = wantsAgent
    ? createAgentTools({
        repoSlug: repoSlug!,
        githubToken: githubToken!,
        tavilyKey: process.env.TAVILY_API_KEY ?? null,
        workBranch: generateWorkBranchName(),
        branchesCreated: new Set(),
      })
    : undefined;

  // Optionally add Daytona sandbox tools (code execution, terminal)
  let sandboxTools: ReturnType<typeof createSandboxTools> | undefined;
  const daytonaKey = process.env.DAYTONA_API_KEY;

  if (wantsAgent && daytonaKey) {
    try {
      const daytona = getDaytonaClient();

      // Use image-based creation for explicit resource allocation.
      // Configurable via env vars; defaults: 8 CPU, 8GB RAM, 30GB disk.
      const cpu = Number(process.env.DAYTONA_SANDBOX_CPU) || 8;
      const memory = Number(process.env.DAYTONA_SANDBOX_MEMORY) || 8;
      const disk = Number(process.env.DAYTONA_SANDBOX_DISK) || 30;

      sandbox = await daytona.create(
        {
          image: process.env.DAYTONA_SANDBOX_IMAGE || "daytonaio/ai-node:22",
          language: "typescript",
          resources: { cpu, memory, disk },
          envVars: { NODE_ENV: "development" },
          autoStopInterval: 15,   // auto-stop after 15 min idle
          autoDeleteInterval: 0,  // ephemeral: delete on stop
        },
        { timeout: 90 },
      );
      console.log(
        `[daytona] Sandbox created: ${sandbox.id} (${cpu} CPU, ${memory}GB RAM, ${disk}GB disk)`,
      );

      sandboxTools = createSandboxTools({
        sandbox,
        repoSlug: repoSlug!,
        githubToken: githubToken!,
        repoCloned: false,
      });

      // Append sandbox info to system prompt
      system += `\n\n## Sandbox (Code Execution)
You have a live sandbox environment powered by Daytona (${cpu} CPU cores, ${memory}GB RAM).
Available tools:
- **run_command**: Execute any shell command (npm install, npm test, git, etc.)
- **execute_code**: Run TypeScript/JavaScript code snippets
- **sandbox_read_file**: Read a file in the sandbox
- **sandbox_write_file**: Write a single file
- **sandbox_write_files**: Write MULTIPLE files in ONE call (STRONGLY PREFERRED for 2+ files)
- **sandbox_list_files**: List directory contents

### ⚡ Performance Rules (IMPORTANT)
1. **ALWAYS use sandbox_write_files** when creating 2+ files. NEVER call sandbox_write_file in a loop — each call adds latency.
2. **Batch operations**: Create all files first, then run npm install once, then test once.
3. **Minimize tool calls**: Combine related operations. Fewer calls = faster execution.

The user's repo is automatically cloned when you first use a sandbox tool.
Workflow: read code → create files (batch) → install deps → test → commit via GitHub.`;
    } catch (err) {
      console.warn("[daytona] Sandbox creation failed, proceeding without:", err);
    }
  }

  // Merge all tools
  const tools = githubTools
    ? { ...githubTools, ...(sandboxTools || {}) }
    : undefined;

  // ── Stream the model response ────────────────────────────────────────
  // Route to the correct provider based on model prefix.
  const providerName = resolveProvider(modelId);
  const resolvedModelId = stripProviderPrefix(modelId);
  const envKey = PROVIDER_ENV_KEYS[providerName];
  const resolvedKey = process.env[envKey];
  const resolvedBaseURL =
    process.env[`${envKey.replace('_API_KEY', '_BASE_URL')}`] ||
    PROVIDER_BASE_URLS[providerName];

  if (!resolvedKey) {
    return NextResponse.json(
      { error: `${envKey} is not set. Add it to your environment variables.` },
      { status: 500 },
    );
  }

  const provider = createOpenAI({
    baseURL: resolvedBaseURL,
    apiKey: resolvedKey,
    // Kimi K2.x and GLM-5 send type:"" instead of type:"function" in
    // tool_call chunks. Our compat fetch patches the SSE stream on the fly.
    ...(needsToolCallTypeFix(resolvedModelId) ? { fetch: toolCallCompatFetch } : {}),
  });

  // ── Context trimming ───────────────────────────────────────────────
  // Long conversations slow down inference dramatically. Keep only
  // the most recent messages; older context is already in the model's
  // memory from previous turns.
  const MAX_CONTEXT_MESSAGES = 20;
  const trimmedMessages =
    messages.length > MAX_CONTEXT_MESSAGES
      ? messages.slice(-MAX_CONTEXT_MESSAGES)
      : messages;

  if (messages.length > MAX_CONTEXT_MESSAGES) {
    const dropped = messages.length - MAX_CONTEXT_MESSAGES;
    system += `\n\nNote: ${dropped} older messages were trimmed from context to keep response fast. Focus on the most recent messages.`;
  }

  try {
    // Agent tasks generate large tool call arguments (e.g. full file content
    // in write_file). 32k gives enough room for reasoning + multi-file writes.
    // GLM-5 and DeepSeek V4 Pro also use reasoning tokens that eat into budget.
    const maxOutputTokens = tools ? 32768 : 8192;

    const result = streamText({
      model: provider.chat(resolvedModelId),
      system,
      messages: await convertToModelMessages(trimmedMessages),
      maxOutputTokens,
      // Agent mode: enable tools + multi-step loop. Cap at 25 steps for
      // complex multi-file tasks while still preventing runaway loops.
      ...(tools
        ? {
            tools,
            stopWhen: stepCountIs(25),
            toolCallStreaming: true,
          }
        : {}),
      onFinish: async (event) => {
        const { text, steps } = event;
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
          .update({ status: "idle", updated_at: new Date().toISOString() })
          .eq("id", conversationId);

        // Tally tool calls across all steps and record the credit spend.
        const toolCount = (steps ?? []).reduce(
          (sum, step) => sum + (step.toolCalls?.length ?? 0),
          0,
        );
        try {
          await recordSpend({
            userId: user.id,
            conversationId,
            kind: turnKind,
            toolCount,
            modelId,
          });
        } catch (err) {
          console.error("[credits] recordSpend failed:", err);
        }

        // Clean up sandbox after response is complete
        if (sandbox) {
          try {
            await sandbox.delete();
            console.log(`[daytona] Sandbox ${sandbox.id} deleted`);
          } catch (err) {
            console.warn("[daytona] Sandbox cleanup failed:", err);
          }
        }
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
    // Mark conversation as idle on error so polling clients stop waiting.
    await supabase
      .from("conversations")
      .update({ status: "idle", updated_at: new Date().toISOString() })
      .eq("id", conversationId)
      .then(() => {}, () => {});

    const message =
      err instanceof Error ? err.message : "Unknown inference error";
    return NextResponse.json(
      { error: `Inference failed: ${message}` },
      { status: 502 },
    );
  }
}
