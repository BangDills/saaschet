import { NextResponse } from "next/server";
import { createOpenAI } from "@ai-sdk/openai";
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  createUIMessageStream,
  createUIMessageStreamResponse,
  APICallError,
  RetryError,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import {
  defaultModelId,
  resolveProvider,
  stripProviderPrefix,
  PROVIDER_BASE_URLS,
  PROVIDER_ENV_KEYS,
  isAgentCapable,
} from "@/lib/chat/models";
import { codexCompatFetch } from "@/lib/chat/codex-compat";
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
import { createContext7Tools } from "@/lib/context7/tools";
import type { Sandbox } from "@daytona/sdk";
import {
  assertCanSpend,
  recordSpend,
  OutOfCreditsError,
} from "@/lib/credits/server";
import {
  refreshAccessToken,
  needsRefresh,
  expiresAt,
} from "@/lib/openai/codex-auth";
import { createAdminClient } from "@/lib/supabase/admin";

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

const AGENT_SYSTEM = `You are **SaaSchet AI Agent** — an advanced AI coding assistant with access to GitHub tools, Serena semantic code tools, Context7 documentation lookup, and web search. You work autonomously to read, analyze, write, and modify code in the user's repository.

## Identity & Mindset
- You are a senior-level software engineer and pair programmer.
- Think carefully before acting. Plan your approach, then execute.
- Be proactive: if you spot bugs, anti-patterns, or improvements while working, mention them.
- You have strong opinions on code quality but hold them loosely.

## Tool Usage Strategy
1. **Explore first**: Use \`list_files\` (depth: 2-3) and \`search_code\` to understand the repo structure before reading/writing.
2. **Read before writing**: ALWAYS \`read_file\` before modifying. Never invent paths or content.
3. **Prefer surgical edits**: For small changes (rename, fix, add import) to a single file, use \`edit_file\` instead of \`write_file\`. It's cheaper and safer.
4. **Use \`write_files\` for 2+ files**: When creating or rewriting multiple files, call \`write_files\` once with all files instead of calling \`write_file\` in a loop. This creates one commit and is much faster.
5. **Use \`write_file\`** only for a single new file or a single complete rewrite.
6. **Use Serena semantic tools** for codebase navigation when available: list Serena tools first, then use symbol overview, find symbol, and find references before large refactors. Serena write/execute tools may be disabled; GitHub write tools remain the primary safe write path.
7. **Use Context7 for library/framework documentation** when you need current API details, setup steps, migration guides, or version-specific behavior. Call \`context7_search_library\` first unless you already know the exact ID, then \`context7_get_docs\`.
8. **Search the web** when Context7 is unavailable or the task needs current information outside library docs.
9. **Commit logically**: Group related changes under one descriptive commit message (conventional-commit style).

## Branching & PRs
- Writes go to a NEW feature branch automatically — never to main.
- **Exception**: Empty repos (no commits). \`write_file\`/\`write_files\` bootstrap on the default branch directly. Don't create a PR in that case.
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
- Use \`write_files\` once to commit all generated/modified files in a single batch commit. Do not call \`write_file\` in a loop.
- Use modern, clean, well-organized code with clear comments.
- Create **production-quality output**: proper meta tags, responsive design, error handling, accessibility.
- Use semantic HTML5, modern CSS (flexbox/grid, variables, animations), and clean ES6+ JavaScript.
- If the project is larger, organize with folders: /src, /assets, /styles, /scripts.
- Add a .gitignore if relevant.
- **Do NOT put everything in a single file.** Separation of concerns is mandatory.
- Think like a senior engineer: write code you'd be proud to show in a code review.
- Do not stop after describing what you are about to do. For action requests, actually use the available tools to read, write/edit files, and open a PR when appropriate.
- If you have not called any repo/sandbox tool yet, the task is not done. Continue with tool execution instead of ending with a plan or preface.

## Communication
- After finishing, give a clear summary: what you did, why, and the PR URL.
- If something failed or was unexpected, explain what happened and suggest next steps.
- Use Markdown with code blocks (with language tags) in your responses.
- For read-only requests ("explain", "find", "what does X do"), just answer — don't write or open a PR.

## Productive Response Style
- Default to a practical, proactive engineering-assistant tone. If the user writes Indonesian, answer in Indonesian.
- Do not stop at a one-sentence summary for repository/codebase questions unless the user explicitly asks for a short answer.
- For repo analysis, include the direct answer plus useful context: what you inspected, what is implemented, notable gaps/risks, and concrete next steps.
- End most read-only repo answers with a short "Langkah berikutnya" / next-action suggestion, such as an audit, refactor, fix, or verification path.
- Keep this productive ending concise: 1-5 bullets, not a long essay.
- Never overclaim. If you have not inspected something, say it is not checked yet. If a file result is truncated, keep reading with offset/limit before claiming full understanding.
- If the user requests an action and tools are available, proceed with tool use instead of only suggesting a plan. If blocked by missing auth/permissions, state exactly what is needed.

## Memory & Context
- Track what you've already read/modified in this conversation.
- Don't re-read files you've already seen unless the user asks for a fresh look.
- Reference your earlier findings when making decisions.
- If the user provides feedback, adapt your approach accordingly.`;

const DEFAULT_MAX_RETRIES = 0;
const MAX_ALLOWED_RETRIES = 2;
const DEFAULT_LIMIT_RECOVERY_DELAY_MS = 20_000;
const MAX_LIMIT_RECOVERY_DELAY_MS = 60_000;
const DEFAULT_LIMIT_RECOVERY_RETRIES = 1;
const MAX_LIMIT_RECOVERY_RETRIES = 2;
const MAX_AGENT_STALL_RECOVERIES = 2;

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

function chatMaxRetries(): number {
  const raw = process.env.AI_CHAT_MAX_RETRIES;
  if (!raw) return DEFAULT_MAX_RETRIES;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) return DEFAULT_MAX_RETRIES;

  return Math.min(parsed, MAX_ALLOWED_RETRIES);
}

function envInteger(
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = process.env[key];
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) return fallback;

  return Math.min(Math.max(parsed, min), max);
}

function limitRecoveryDelayMs(): number {
  return envInteger(
    "AI_AGENT_LIMIT_RECOVERY_DELAY_MS",
    DEFAULT_LIMIT_RECOVERY_DELAY_MS,
    0,
    MAX_LIMIT_RECOVERY_DELAY_MS,
  );
}

function limitRecoveryRetries(): number {
  return envInteger(
    "AI_AGENT_LIMIT_RECOVERY_RETRIES",
    DEFAULT_LIMIT_RECOVERY_RETRIES,
    0,
    MAX_LIMIT_RECOVERY_RETRIES,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findApiCallError(err: unknown, seen = new Set<unknown>()): APICallError | null {
  if (!err || seen.has(err)) return null;
  seen.add(err);

  if (APICallError.isInstance(err)) return err;

  if (RetryError.isInstance(err)) {
    const fromLast = findApiCallError(err.lastError, seen);
    if (fromLast) return fromLast;

    for (const retryErr of err.errors) {
      const found = findApiCallError(retryErr, seen);
      if (found) return found;
    }
  }

  if (typeof err === "object" && "cause" in err) {
    return findApiCallError((err as { cause?: unknown }).cause, seen);
  }

  return null;
}

function retryAfterSeconds(headers: Record<string, string> | undefined): number | null {
  if (!headers) return null;

  const retryAfterMs = headers["retry-after-ms"];
  if (retryAfterMs) {
    const ms = Number(retryAfterMs);
    if (Number.isFinite(ms) && ms > 0) return Math.ceil(ms / 1000);
  }

  const retryAfter = headers["retry-after"];
  if (!retryAfter) return null;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);

  const dateMs = Date.parse(retryAfter);
  if (!Number.isNaN(dateMs)) {
    return Math.max(1, Math.ceil((dateMs - Date.now()) / 1000));
  }

  return null;
}

function formatInferenceError(err: unknown): { message: string; status: number; code: string } {
  const apiErr = findApiCallError(err);
  const rawMessage = err instanceof Error ? err.message : "Unknown inference error";
  const lowerMessage = rawMessage.toLowerCase();
  const statusCode = apiErr?.statusCode;

  if (
    statusCode === 429 ||
    lowerMessage.includes("rate limit") ||
    lowerMessage.includes("quota") ||
    lowerMessage.includes("limit exceeded")
  ) {
    const wait = retryAfterSeconds(apiErr?.responseHeaders);
    return {
      message: wait
        ? `Model provider rate limit reached. Please wait about ${wait} seconds, then try again.`
        : "Model provider rate limit reached. Please wait a moment, then try again.",
      status: 429,
      code: "provider_rate_limited",
    };
  }

  if (statusCode === 401 || statusCode === 403) {
    return {
      message: "Model provider rejected the API credentials. Check the selected model's API key or reconnect the account.",
      status: statusCode,
      code: "provider_auth_failed",
    };
  }

  if (statusCode && statusCode >= 500) {
    return {
      message: "Model provider is temporarily unavailable. Please try again shortly.",
      status: 502,
      code: "provider_unavailable",
    };
  }

  return {
    message: `Inference failed: ${rawMessage}`,
    status: 502,
    code: "inference_failed",
  };
}

function isRateLimitFailure(err: unknown): boolean {
  return formatInferenceError(err).code === "provider_rate_limited";
}

function isRateLimitMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("rate limit") ||
    lower.includes("rate-limit") ||
    lower.includes("quota") ||
    lower.includes("limit reached") ||
    lower.includes("limit exceeded")
  );
}

function writeRecoveryNote(
  writer: { write: (part: UIMessageChunk) => void },
  text: string,
) {
  const id = `recovery-${crypto.randomUUID()}`;
  writer.write({ type: "text-start", id });
  writer.write({ type: "text-delta", id, delta: text });
  writer.write({ type: "text-end", id });
}

function looksLikeActionRequest(text: string): boolean {
  const lower = text.toLowerCase();
  return [
    "buat",
    "bikin",
    "ubah",
    "edit",
    "fix",
    "perbaiki",
    "pasang",
    "tambah",
    "implement",
    "create",
    "build",
    "update",
    "refactor",
    "generate",
    "deploy",
  ].some((word) => lower.includes(word));
}

function looksLikeStalledAgentText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (trimmed.endsWith(":")) return true;

  const lower = trimmed.toLowerCase();
  return [
    "sekarang saya akan",
    "sekarang buat",
    "akan saya",
    "i will",
    "i'll",
    "next,",
    "now i",
    "let me",
  ].some((phrase) => lower.includes(phrase));
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
  const userId = user.id;

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

  // ── Look up GitHub token + OpenAI tokens (used by context fetch + agent tools) ──
  const { data: profile } = await supabase
    .from("profiles")
    .select("github_token, openai_access_token, openai_refresh_token, openai_token_expires")
    .eq("id", userId)
    .maybeSingle();
  const githubToken: string | undefined = profile?.github_token ?? undefined;

  // ── Pre-flight: daily credit check ───────────────────────────────────
  const turnKind: "chat" | "agent" = wantsAgent ? "agent" : "chat";
  try {
    await assertCanSpend(userId, turnKind);
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
      user_id: userId,
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
      .eq("user_id", userId)
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
  const workBranch = wantsAgent ? generateWorkBranchName() : null;

  const githubTools = wantsAgent
    ? createAgentTools({
        repoSlug: repoSlug!,
        githubToken,
        tavilyKey: process.env.TAVILY_API_KEY ?? null,
        context7Key: process.env.CONTEXT7_API_KEY ?? null,
        serenaUrl: process.env.SERENA_MCP_URL ?? null,
        serenaAuthToken: process.env.SERENA_MCP_TOKEN ?? null,
        serenaAllowWriteTools:
          process.env.SERENA_ALLOW_WRITE_TOOLS === "true",
        workBranch: workBranch!,
        branchesCreated: new Set(),
      })
    : undefined;

  if (wantsAgent && !githubToken) {
    system += `\n\n## GitHub Access Mode
The connected repository is being accessed without GitHub authentication. You may use read-only repository tools for public repositories. You cannot write files, create branches, run sandbox operations, or open pull requests. For private repositories or code changes, ask the user to connect GitHub.`;
  }

  if (wantsAgent && githubToken && workBranch) {
    system += `\n\n## Recovery & Continuation
All GitHub write tools (\`write_file\`, \`write_files\`, \`edit_file\`) operate on the same work branch: \`${workBranch}\`.
If a model attempt is interrupted by provider rate limits, the next attempt must inspect the current repo/branch state and continue from the work already completed instead of starting over.`;
  }

  // Optionally add Daytona sandbox tools (code execution, terminal)
  let sandboxTools: ReturnType<typeof createSandboxTools> | undefined;
  const daytonaKey = process.env.DAYTONA_API_KEY;

  if (wantsAgent && githubToken && daytonaKey) {
    try {
      const daytona = getDaytonaClient();

      // Use image-based creation for explicit resource allocation.
      // Configurable via env vars; defaults: 4 CPU, 8GB RAM, 30GB disk.
      const cpu = Number(process.env.DAYTONA_SANDBOX_CPU) || 4;
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
        githubToken,
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
      const errorMsg = err instanceof Error ? err.message : String(err);
      system += `\n\n## Daytona Sandbox Initialization Error\nDaytona sandbox failed to initialize: "${errorMsg}". If the user asks to run a command or execute code, explain to them that the sandbox failed to initialize with this reason.`;
    }
  }

  const context7Tools =
    !wantsAgent && isAgentCapable(modelId)
      ? createContext7Tools({
          context7Key: process.env.CONTEXT7_API_KEY ?? null,
        })
      : undefined;

  if (context7Tools) {
    system += `\n\n## Context7 Documentation Lookup
You have Context7 tools available for current library/framework documentation.
When the user asks about library APIs, setup, migrations, or version-specific behavior, use \`context7_search_library\` then \`context7_get_docs\` before answering.`;
  }

  // Merge all tools. Agent Mode includes GitHub tools, Context7, and optional
  // sandbox tools. Chat mode can still use Context7 without a connected repo.
  const tools = githubTools
    ? { ...githubTools, ...(sandboxTools || {}) }
    : context7Tools;

  // ── Stream the model response ────────────────────────────────────────
  // Route to the correct provider based on model prefix.
  const providerName = resolveProvider(modelId);

  let resolvedKey: string | undefined;

  if (providerName === "codex") {
    // ── Codex: use the user's own ChatGPT OAuth token ──
    if (!profile?.openai_access_token) {
      return NextResponse.json(
        {
          error:
            "This model requires you to connect your ChatGPT account. Go to Profile → Extensions to connect.",
          code: "openai_auth_required",
        },
        { status: 403 },
      );
    }

    let accessToken = profile.openai_access_token as string;
    const refreshToken = (profile.openai_refresh_token as string) || "";
    const tokenExpires = (profile.openai_token_expires as string) || null;

    // Auto-refresh expired tokens
    if (needsRefresh(tokenExpires) && refreshToken) {
      try {
        const newTokens = await refreshAccessToken(refreshToken);
        accessToken = newTokens.access_token;

        // Persist the new tokens
        const admin = createAdminClient();
        await admin
          .from("profiles")
          .update({
            openai_access_token: newTokens.access_token,
            openai_refresh_token: newTokens.refresh_token,
            openai_token_expires: expiresAt(newTokens.expires_in),
          })
          .eq("id", userId);
      } catch (err) {
        console.error("[chat] Codex token refresh failed:", err);
        return NextResponse.json(
          {
            error:
              "Your ChatGPT session has expired. Please reconnect in Profile → Extensions.",
            code: "openai_auth_expired",
          },
          { status: 401 },
        );
      }
    }

    resolvedKey = accessToken;
  } else {
    // ── Standard provider: use server-side env key ──
    const envKey = PROVIDER_ENV_KEYS[providerName];
    resolvedKey = process.env[envKey];

    if (!resolvedKey) {
      return NextResponse.json(
        { error: `${envKey} is not set. Add it to your environment variables.` },
        { status: 500 },
      );
    }
  }

  function canUseModel(candidateModelId: string): boolean {
    const candidateProvider = resolveProvider(candidateModelId);
    if (candidateProvider === "codex") {
      return candidateModelId === modelId && !!resolvedKey;
    }

    const envKey = PROVIDER_ENV_KEYS[candidateProvider];
    return !!process.env[envKey];
  }

  function agentAttemptModelIds(): string[] {
    if (!tools) return [modelId];

    const candidates = [
      modelId,
      "opencode/deepseek-v4-flash-free",
      "deepseek-4-flash",
      "deepseek-v4-pro",
      "kimi-k2.6",
      "kimi-k2.5",
      "glm-5",
    ];

    return Array.from(new Set(candidates)).filter(
      (candidate) => isAgentCapable(candidate) && canUseModel(candidate),
    );
  }

  function createProviderForModel(candidateModelId: string) {
    const candidateProvider = resolveProvider(candidateModelId);
    const candidateResolvedModelId = stripProviderPrefix(candidateModelId);

    let candidateKey: string | undefined;
    let candidateBaseURL: string;

    if (candidateProvider === "codex") {
      candidateKey = resolvedKey;
      candidateBaseURL = PROVIDER_BASE_URLS[candidateProvider];
    } else {
      const envKey = PROVIDER_ENV_KEYS[candidateProvider];
      candidateKey = process.env[envKey];
      candidateBaseURL =
        process.env[`${envKey.replace("_API_KEY", "_BASE_URL")}`] ||
        PROVIDER_BASE_URLS[candidateProvider];
    }

    if (!candidateKey) {
      throw new Error(`No API key configured for ${candidateProvider}`);
    }

    const candidateOpenAI = createOpenAI({
      baseURL: candidateBaseURL,
      apiKey: candidateKey,
      // Codex has a stricter Responses API contract than api.openai.com.
      // Kimi K2.x and GLM-5 need stream patching for malformed tool calls.
      ...(candidateProvider === "codex"
        ? { fetch: codexCompatFetch }
        : needsToolCallTypeFix(candidateResolvedModelId)
          ? { fetch: toolCallCompatFetch }
          : {}),
    });

    return {
      providerName: candidateProvider,
      resolvedModelId: candidateResolvedModelId,
      provider: candidateOpenAI,
    };
  }

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
    const modelMessages = await convertToModelMessages(trimmedMessages);
    // Agent tasks generate large tool call arguments (e.g. full file content
    // in write_file). 32k gives enough room for reasoning + multi-file writes.
    // GLM-5 and DeepSeek V4 Pro also use reasoning tokens that eat into budget.
    const maxOutputTokens = tools ? 32768 : 8192;
    let sandboxCleaned = false;
    let finishedSuccessfully = false;
    let totalToolCount = 0;
    let lastAttemptToolCount = 0;
    let lastAttemptText = "";
    let lastFinishReason = "";
    let finalModelId = modelId;

    async function markConversationIdle() {
      await supabase
        .from("conversations")
        .update({ status: "idle", updated_at: new Date().toISOString() })
        .eq("id", conversationId);
    }

    async function cleanupSandbox(reason: string) {
      if (!sandbox || sandboxCleaned) return;
      sandboxCleaned = true;

      try {
        await sandbox.delete();
        console.log(`[daytona] Sandbox ${sandbox.id} deleted ${reason}`);
      } catch (err) {
        console.warn("[daytona] Sandbox cleanup failed:", err);
      }
    }

    async function finalizeSuccessfulTurn() {
      if (finishedSuccessfully) return;
      finishedSuccessfully = true;

      await markConversationIdle();

      try {
        await recordSpend({
          userId,
          conversationId,
          kind: turnKind,
          toolCount: totalToolCount,
          modelId: finalModelId,
        });
      } catch (err) {
        console.error("[credits] recordSpend failed:", err);
      }

      await cleanupSandbox("after completion");
    }

    function shouldRecoverStalledAgentAttempt(): boolean {
      if (!wantsAgent || !tools) return false;
      if (!looksLikeActionRequest(userText)) return false;
      if (lastAttemptToolCount > 0) return false;
      if (lastFinishReason === "length") return true;
      return looksLikeStalledAgentText(lastAttemptText);
    }

    function startAttempt(candidateModelId: string, attemptIndex: number) {
      const candidate = createProviderForModel(candidateModelId);
      const recoveryInstruction = wantsAgent
        ? "Inspect the current repo/branch and sandbox state first, reuse completed work, avoid duplicate commits or PRs, and finish the user's request."
        : "Continue the same user request. If documentation lookup was needed, use the available Context7 tool results or call the Context7 tools again as needed.";
      const recoverySystem =
        attemptIndex === 0
          ? system
          : `${system}\n\n## Current Recovery Attempt
The previous model attempt was interrupted by provider rate limits before it could finish. Continue the same task now with model \`${candidateModelId}\`.
${recoveryInstruction}`;

      return streamText({
        model:
          candidate.providerName === "codex"
            ? candidate.provider.responses(candidate.resolvedModelId)
            : candidate.provider.chat(candidate.resolvedModelId),
        system: recoverySystem,
        messages: modelMessages,
        ...(candidate.providerName === "codex" ? {} : { maxOutputTokens }),
        ...(candidate.providerName === "codex"
          ? {
              providerOptions: {
                openai: {
                  store: false,
                  reasoningEffort: "medium",
                  reasoningSummary: "auto",
                  forceReasoning: true,
                },
              },
            }
          : {}),
        // Keep retries conservative. Provider 429/quota errors are retryable to
        // the SDK, but repeating them can quickly turn one user action into many
        // failed attempts. Override with AI_CHAT_MAX_RETRIES only if needed.
        maxRetries: chatMaxRetries(),
        // Agent mode: enable tools + multi-step loop. Cap at 15 steps to stay
        // within rate limits while still handling multi-file tasks.
        ...(tools
          ? {
              tools,
              stopWhen: stepCountIs(15),
              toolCallStreaming: true,
            }
          : {}),
        onFinish: async (event) => {
          const { text, steps, finishReason } = event;
          lastAttemptText = text;
          lastFinishReason = finishReason ?? "";
          lastAttemptToolCount = (steps ?? []).reduce(
            (sum, step) => sum + (step.toolCalls?.length ?? 0),
            0,
          );
          totalToolCount += lastAttemptToolCount;
          finalModelId = candidateModelId;

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
        },
      });
    }

    async function pipeAttemptToWriter(
      writer: { write: (part: UIMessageChunk) => void },
      candidateModelId: string,
      attemptIndex: number,
    ): Promise<"completed" | "rate_limited"> {
      const result = startAttempt(candidateModelId, attemptIndex);
      const stream = result.toUIMessageStream({
        onError: (error) => formatInferenceError(error).message,
      });
      const reader = stream.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) return "completed";

          if (value.type === "error" && isRateLimitMessage(value.errorText)) {
            return "rate_limited";
          }

          writer.write(value);
        }
      } catch (err) {
        if (isRateLimitFailure(err)) return "rate_limited";
        throw err;
      } finally {
        reader.releaseLock();
      }
    }

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const attempts = agentAttemptModelIds();
        let lastRateLimit = false;
        let recoveryRetriesUsed = 0;
        let stallRecoveriesUsed = 0;
        let i = 0;
        let totalAttempts = 0;

        while (i < attempts.length) {
          const attemptModelId = attempts[i];
          const result = await pipeAttemptToWriter(
            writer,
            attemptModelId,
            totalAttempts,
          );
          totalAttempts++;

          if (result === "completed") {
            if (shouldRecoverStalledAgentAttempt()) {
              if (stallRecoveriesUsed < MAX_AGENT_STALL_RECOVERIES) {
                stallRecoveriesUsed++;
                writeRecoveryNote(
                  writer,
                  `\n\nAgent attempt ended before using tools or making repo progress. Restarting the same task and continuing with tool execution...\n\n`,
                );
                continue;
              }

              await markConversationIdle();
              await cleanupSandbox("after stalled agent attempts");
              throw new Error(
                "Agent stopped before using repo tools or making progress. Please try again or switch to another agent-capable model.",
              );
            }

            await finalizeSuccessfulTurn();
            return;
          }

          lastRateLimit = true;
          const nextModel = attempts[i + 1];
          if (nextModel) {
            writeRecoveryNote(
              writer,
              `\n\nModel provider limit reached on \`${attemptModelId}\`. Switching to \`${nextModel}\` and continuing the same task...\n\n`,
            );
            i++;
            continue;
          }

          const delayMs = limitRecoveryDelayMs();
          if (recoveryRetriesUsed < limitRecoveryRetries()) {
            recoveryRetriesUsed++;
            writeRecoveryNote(
              writer,
              `\n\nModel provider limit reached on \`${attemptModelId}\`. Waiting ${Math.ceil(delayMs / 1000)} seconds, then restarting this attempt to continue the same task...\n\n`,
            );
            await sleep(delayMs);
            continue;
          }

          break;
        }

        if (lastRateLimit) {
          await markConversationIdle();
          await cleanupSandbox("after rate-limit exhaustion");
          throw new Error(
            "Model provider rate limit reached and no configured fallback model could continue the agent run.",
          );
        }
      },
      onError: (error) => formatInferenceError(error).message,
    });

    return createUIMessageStreamResponse({
      stream,
      headers: {
        "X-Accel-Buffering": "no",
        "Cache-Control": "no-cache, no-transform",
        "X-Conversation-Id": conversationId,
      },
      consumeSseStream: async ({ stream: sseStream }) => {
        try {
          await new Response(sseStream).text();
        } finally {
          if (!finishedSuccessfully) {
            await markConversationIdle();
            await cleanupSandbox("after stream end");
          }
        }
      },
    });
  } catch (err) {
    // Mark conversation as idle on error so polling clients stop waiting.
    await supabase
      .from("conversations")
      .update({ status: "idle", updated_at: new Date().toISOString() })
      .eq("id", conversationId)
      .then(() => {}, () => {});

    const formattedError = formatInferenceError(err);
    return NextResponse.json(
      { error: formattedError.message, code: formattedError.code },
      { status: formattedError.status },
    );
  }
}
