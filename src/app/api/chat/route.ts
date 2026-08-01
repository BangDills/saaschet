import { NextResponse, after } from "next/server";
import { createOpenAI } from "@ai-sdk/openai";
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import {
  defaultModelId,
  defaultModels,
  resolveProvider,
  stripProviderPrefix,
  PROVIDER_BASE_URLS,
  PROVIDER_ENV_KEYS,
  isAgentCapable,
  maxOutputFor,
} from "@/lib/chat/models";
import { searchWeb, formatSearchResults } from "@/lib/chat/web-search";
import { deriveTitle } from "@/lib/chat/storage";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRun, subscribeToRun, endRun, type AgentRun } from "@/lib/chat/run-registry";
import { driveRunInBackground } from "@/lib/chat/background-run";
import { fetchRepoBundle, parseRepoSlug } from "@/lib/github/client";
import { resolveGitHubAuth } from "@/lib/github/app-client";
import { ensureRepoIndexed } from "@/lib/indexing/index-repo";
import { formatRepoForContext } from "@/lib/github/format";
import {
  createAgentTools,
  generateWorkBranchName,
} from "@/lib/agent/tools";
import { type AgentCompletionState } from "@/lib/agent/action-registry";
import { generateFollowUps } from "@/lib/chat/turn/follow-ups";
import { getDaytonaClient } from "@/lib/daytona/client";
import { provisionSandbox, sandboxResourceHints } from "@/lib/daytona/provision";
import { createSandboxTools, type SandboxContext } from "@/lib/daytona/sandbox-tools";
import { createContext7Tools } from "@/lib/context7/tools";
import type { Sandbox } from "@daytona/sdk";
import {
  assertCanSpend,
  reserveSpend,
  settleSpend,
  OutOfCreditsError,
  type CreditReservation,
} from "@/lib/credits/server";
import { searchMemories } from "@/lib/chat/memory";
import { extractAndSaveMemories } from "@/lib/chat/memory-extractor";
import { getStructuredMemory, formatStructuredMemory } from "@/lib/chat/structured-memory";
import { extractAndSaveStructuredMemory } from "@/lib/chat/structured-memory-extractor";
import { createLogger } from "@/lib/logger";
import { DEFAULT_SYSTEM, AGENT_SYSTEM } from "@/lib/chat/turn/prompts";
import { stopOnToolFailure, deriveAgentState } from "@/lib/chat/turn/agent-state";
import {
  chatMaxRetries,
  limitRecoveryDelayMs,
  limitRecoveryRetries,
  sleep,
  formatInferenceError,
  isRateLimitFailure,
  isRateLimitMessage,
  isTransientFailure,
  transientRetries,
  transientRetryDelayMs,
} from "@/lib/chat/turn/inference-errors";
import {
  lastUserText,
  writeRecoveryNote,
  looksLikeActionRequest,
  looksLikeStalledAgentText,
  findExistingWorkBranch,
} from "@/lib/chat/turn/message-text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Agent loops can run multi-step; bump the function timeout on Vercel.
// 300s = 5 minutes, the maximum on Vercel Pro. Agent tasks (e.g. creating
// a full landing page) can involve 10–20 tool calls which take time.
export const maxDuration = 300;

const log = createLogger("chat");
const sandboxLog = createLogger("sandbox");

/* ─────────────────────────────────────────────────────────────────────────
 * Stale-sandbox guards
 *
 * Daytona's label lookup is eventually consistent: a sandbox this server
 * deleted moments ago is still returned by `list()` reporting state
 * "started". Observed in production — one was deleted at :33.244 and adopted
 * as "reusing sandbox" at :33.355, 111ms later. Every command against it then
 * failed with 404 "not found (it has been deleted)", the repo presence check
 * and clone both failed, and the turn died without recovering.
 *
 * Two guards, deliberately layered. The tombstone is free and catches the
 * common case (same process, same container). The liveness probe costs one
 * round trip but also covers what the tombstone cannot: orphans left by a
 * crashed run, a restarted server, or another instance.
 * ────────────────────────────────────────────────────────────────────── */

/** Sandbox ids this process deleted recently, with the time of deletion. */
const deletedSandboxIds = new Map<string, number>();
const DELETED_TOMBSTONE_MS = 5 * 60_000;

function markSandboxDeleted(id: string): void {
  const now = Date.now();
  deletedSandboxIds.set(id, now);
  // Opportunistic sweep — this map only ever holds ids from live conversations.
  for (const [key, deletedAt] of deletedSandboxIds) {
    if (now - deletedAt > DELETED_TOMBSTONE_MS) deletedSandboxIds.delete(key);
  }
}

function isRecentlyDeleted(id: string): boolean {
  const deletedAt = deletedSandboxIds.get(id);
  if (deletedAt === undefined) return false;
  if (Date.now() - deletedAt > DELETED_TOMBSTONE_MS) {
    deletedSandboxIds.delete(id);
    return false;
  }
  return true;
}

/**
 * Cheapest possible proof that a listed sandbox actually still exists.
 * `state` cannot be trusted here, so ask the sandbox to do something trivial.
 */
async function isSandboxAlive(candidate: Sandbox): Promise<boolean> {
  try {
    await candidate.process.executeCommand("true", undefined, undefined, 10);
    return true;
  } catch (err) {
    sandboxLog.debug("liveness probe failed", { sandboxId: candidate.id, err });
    return false;
  }
}

/**
 * Schedule non-critical follow-up work (memory extraction) without blocking.
 *
 * `after()` is what keeps a serverless function alive past the response, but
 * it only works inside a request scope — and an agent turn is now a detached
 * run whose callbacks routinely fire after the response has ended. So try
 * `after()` first and fall back to a plain detached promise, which is all a
 * persistent server (the production target) needs anyway.
 */
function detachTask(label: string, task: () => Promise<unknown>): void {
  const guarded = () =>
    task().catch((err) => log.error("detached task failed", { label, err }));
  try {
    after(guarded);
  } catch {
    void guarded();
  }
}

const MAX_AGENT_STALL_RECOVERIES = 2;

type ChatRequestBody = {
  messages: UIMessage[];
  model?: string;
  trigger?: "submit-message" | "regenerate-message" | "resume-stream";
  messageId?: string;
  /** UUID generated client-side; server uses it to upsert the conversation row. */
  conversationId: string;
  /** When true, run web search on the latest user message and prepend results. */
  webSearch?: boolean;
  /** "owner/repo" — when set, the repo's README + manifest + tree is
   *  injected as context. Also persisted onto the conversation row. */
  repo?: string | null;
  /** Optional project folder id to file this conversation under. Set on
   *  first send (creation) so a new chat lands in the selected project. */
  projectId?: string | null;
  /** Optional system prompt override. */
  system?: string;
};

export async function POST(req: Request) {
  // Turn start — emitted with the message metadata so the UI can show
  // "Completed in 18s" (cumulative across model-fallback attempts).
  const turnStartedAt = Date.now();
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
  // Validate the requested model against the catalog. Old conversations may
  // carry a model_id from a removed provider (e.g. "qwen3.7-max", the old
  // Alibaba ids) which would route to Fireworks and 404. Fall back to the
  // default model in that case.
  const knownModelIds = new Set(defaultModels.map((m) => m.id));
  const modelId =
    body.model && knownModelIds.has(body.model) ? body.model : defaultModelId;
  const isRegeneration = body.trigger === "regenerate-message";
  const conversationId = body.conversationId;
  const repoSlug = body.repo?.trim() || null;
  // Optional project folder. We only file the conversation under it on
  // creation (first send). Renaming/moving happens via PATCH [id].
  const projectIdRaw =
    typeof body.projectId === "string" ? body.projectId.trim() : null;
  const projectId = projectIdRaw || null;

  // Agent mode is automatic: if the model supports tool calling AND
  // a repo is connected, agent tools are enabled. Web search is always
  // available in this mode through the agent's web_search tool.
  const wantsAgent = isAgentCapable(modelId) && !!repoSlug;
  const wantsWebSearch = body.webSearch === true || wantsAgent;

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

  // ── Resolve the GitHub token for this turn ─────────────────────────
  // GitHub App installations take priority (per-repo, 1-hour tokens);
  // the legacy OAuth token in profiles.github_token remains as fallback
  // until the Phase 3 cutover. Null → read-only public repo access.
  const ghAuth = await resolveGitHubAuth(userId, repoSlug ?? undefined);
  const githubToken: string | undefined = ghAuth.token ?? undefined;

  // ── Auto-index: silently ensure a connected repo gets indexed ─────
  // Fire-and-forget; the index "just appears" without any button or UI.
  if (repoSlug) {
    ensureRepoIndexed({ userId, repoFullName: repoSlug });
  }

  // ── Semantic index status for this repo (enables search_codebase) ──
  let codebaseIndexed = false;
  if (wantsAgent && repoSlug) {
    const { data: ix } = await supabase
      .from("repo_indexes")
      .select("status")
      .eq("user_id", userId)
      .eq("repo_full_name", repoSlug)
      .eq("status", "ready")
      .maybeSingle();
    codebaseIndexed = !!ix;
  }

  // ── Pre-flight: daily credit check ───────────────────────────────────
  // Read-only and purely for UX: a fast 402 before any expensive work.
  // The AUTHORITATIVE gate is the atomic reserveSpend right before the
  // model run starts — this check alone can be raced by parallel requests.
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
    // If a project was selected, make sure it belongs to this user before
    // filing the new conversation under it. RLS also guards the insert, but
    // a dangling projectId would otherwise silently null out.
    let verifiedProjectId = projectId;
    if (verifiedProjectId) {
      const { data: project } = await supabase
        .from("projects")
        .select("id")
        .eq("id", verifiedProjectId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!project) verifiedProjectId = null;
    }
    const { error: insertErr } = await supabase.from("conversations").insert({
      id: conversationId,
      user_id: userId,
      title: deriveTitle(userText),
      model_id: modelId,
      github_repo: repoSlug,
      project_id: verifiedProjectId,
      status: "processing",
    });
    if (insertErr) {
      log.error("create conversation failed", { conversationId, err: insertErr.message });
      return NextResponse.json(
        { error: "Failed to create conversation." },
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
  const lastUserMsg = messages[messages.length - 1];
  let dbContent = userText;
  if (lastUserMsg && Array.isArray(lastUserMsg.parts)) {
    const fileParts = lastUserMsg.parts.filter((p) => p.type === "file");
    if (fileParts.length > 0) {
      const imageMarkdown = fileParts
        .filter((fp) => fp.mediaType?.startsWith("image/"))
        .map((fp) => `\n![${fp.filename || "Uploaded image"}](${fp.url})`)
        .join("");
      dbContent = (userText + imageMarkdown).trim();
    }
  }

  if (isRegeneration) {
    // Regeneration reuses the existing user turn. Remove only the latest
    // persisted assistant response so the replacement does not duplicate it.
    const { data: latestPersistedMessage, error: latestMessageErr } = await supabase
      .from("messages")
      .select("id, role")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestMessageErr) {
      log.error("retry prepare failed", { conversationId, err: latestMessageErr.message });
      return NextResponse.json(
        { error: "Failed to prepare retry." },
        { status: 500 },
      );
    }

    // A failed turn already ends with its persisted user message, so there is
    // no assistant row to replace. This also preserves the preceding response.
    if (latestPersistedMessage?.role === "assistant") {
      const { error: deleteAssistantErr } = await supabase
        .from("messages")
        .delete()
        .eq("id", latestPersistedMessage.id)
        .eq("conversation_id", conversationId);
      if (deleteAssistantErr) {
        log.error("replace response failed", { conversationId, err: deleteAssistantErr.message });
        return NextResponse.json(
          { error: "Failed to replace response." },
          { status: 500 },
        );
      }
    }
  } else {
    const { error: userMsgErr } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: dbContent,
    });
    if (userMsgErr) {
      log.error("save user message failed", { conversationId, err: userMsgErr.message });
      return NextResponse.json(
        { error: "Failed to save user message." },
        { status: 500 },
      );
    }
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
    log.warn("memory context fetch failed", { err });
  }

  // ── Retrieve long-term vector memories ───────────────────────────────
  let vectorMemoryContext = "";
  if (userText) {
    try {
      const memories = await searchMemories(userId, userText, 5, 0.7);
      if (memories.length > 0) {
        vectorMemoryContext = `\n\n## Long-term Memory (User Preferences & Project Context)\n${memories.map((m) => `- ${m}`).join("\n")}`;
      }
    } catch (err) {
      log.warn("vector memory search failed", { err });
    }
  }

  // ── Retrieve structured JSONB profile memory ─────��───────────────────
  let structuredMemoryContext = "";
  try {
    const structuredMemory = await getStructuredMemory(userId);
    structuredMemoryContext = formatStructuredMemory(structuredMemory);
  } catch (err) {
    log.warn("structured memory fetch failed", { err });
  }

  // ── Build system prompt ──────────────────────────────────────────────
  let system =
    (body.system?.trim() || (wantsAgent ? AGENT_SYSTEM : DEFAULT_SYSTEM)) +
    memoryContext +
    vectorMemoryContext +
    structuredMemoryContext;

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
        log.warn("web search failed", { err });
      }
    } else if (!tavilyKey) {
      log.warn("web search requested but TAVILY_API_KEY is not set — skipping");
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
        log.warn("repo fetch failed", { repo: `${parsed.owner}/${parsed.name}`, err });
        system = `${system}\n\nNote: the user wanted ${parsed.owner}/${parsed.name} as repo context but it could not be fetched. Politely tell them the repo is unreachable (private without sufficient OAuth scope, or rate-limited) and continue without it.`;
      }
    }
  }

  // ── Build agent tools (only when wantsAgent) ─────────────────────────
  let sandbox: Sandbox | null = null;
  const workBranch = wantsAgent
    ? (findExistingWorkBranch(messages) || generateWorkBranchName())
    : null;

  const githubTools = wantsAgent
    ? createAgentTools({
        repoSlug: repoSlug!,
        userId,
        codebaseIndexed,
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
The connected repository is being accessed without GitHub authentication. You may use read-only repository tools for public repositories. You cannot write files, delete files, create branches, run sandbox operations, or open pull requests. For private repositories or code changes, ask the user to connect GitHub.`;
  }

  if (wantsAgent && githubToken && workBranch) {
    system += `\n\n## Recovery & Continuation
All GitHub write tools (\`write_file\`, \`write_files\`, \`edit_file\`, \`delete_file\`) operate on the same work branch: \`${workBranch}\`.
If a model attempt is interrupted by provider rate limits, the next attempt must inspect the current repo/branch state and continue from the work already completed instead of starting over.`;
  }

  if (wantsAgent && codebaseIndexed) {
    system += `\n\n## Codebase Index
This repository is semantically indexed. Prefer \`search_codebase\` FIRST for exploratory questions about the codebase — it is faster and cheaper than crawling directories. Follow up with read_file on the reported paths when you need full file context.`;
  }

  // Optionally add sandbox tools (code execution, terminal)
  let sandboxTools: ReturnType<typeof createSandboxTools> | undefined;
  const daytonaKey = process.env.DAYTONA_API_KEY;

  if (wantsAgent && githubToken && daytonaKey) {
    try {
      const daytona = getDaytonaClient();

      // Creation itself lives in lib/daytona/provision.ts — the tools need to
      // call it too when a sandbox vanishes mid-turn, and two copies of that
      // snapshot/image/language branching would drift.
      const { cpu, memory } = sandboxResourceHints();

      // One live sandbox per conversation: turns reuse it via this label
      // instead of paying a cold start + re-clone each time — and, just as
      // important, instead of stacking N concurrent sandboxes against the
      // org's total-memory quota. autoStopInterval below is the reaper.
      const sandboxLabels = { "celiuz-conversation": conversationId };
      try {
        for await (const candidate of daytona.list({ labels: sandboxLabels })) {
          if (candidate.state !== "started") continue;

          // `state` is not evidence. See the stale-sandbox guards above: a
          // sandbox deleted milliseconds ago still lists as "started", and
          // adopting it poisons the whole turn.
          if (isRecentlyDeleted(candidate.id)) {
            sandboxLog.info("ignoring sandbox we just deleted", { sandboxId: candidate.id });
            continue;
          }
          if (!(await isSandboxAlive(candidate))) {
            sandboxLog.warn("ignoring stale sandbox from label lookup", {
              sandboxId: candidate.id,
            });
            markSandboxDeleted(candidate.id);
            continue;
          }

          sandbox = candidate;
          sandboxLog.info("reusing sandbox", { sandboxId: candidate.id });
          break;
        }
      } catch (lookupErr) {
        sandboxLog.warn("label lookup failed — creating fresh", { err: lookupErr });
      }

      if (!sandbox) {
        sandbox = (await provisionSandbox(conversationId)).sandbox;
      }
      // Pin the narrowed value: `sandbox` is reassigned from inside
      // onSandboxReplaced below, and a let that a closure writes to is shaky
      // ground for control-flow narrowing.
      const activeSandbox = sandbox;

      // The context object is shared by reference with the tools, which replace
      // `sandbox` on it when one vanishes mid-turn. onSandboxReplaced keeps this
      // scope in step: without it cleanupSandbox would delete the dead id and
      // LEAK the replacement, leaving it to hold quota until Daytona reaps it.
      const sandboxCtx: SandboxContext = {
        sandbox: activeSandbox,
        repoSlug: repoSlug!,
        githubToken: githubToken || process.env.GITHUB_TOKEN || "",
        repoCloned: false,
        provisionSandbox: async () => (await provisionSandbox(conversationId)).sandbox,
        onSandboxReplaced: (next, deadId) => {
          markSandboxDeleted(deadId);
          sandbox = next;
          sandboxLog.info("sandbox replaced mid-turn", {
            deadSandboxId: deadId,
            sandboxId: next.id,
          });
        },
      };
      sandboxTools = createSandboxTools(sandboxCtx);

      // Append sandbox info to system prompt
      system += `\n\n## Sandbox (Code Execution)
You have a live sandbox environment (${cpu} CPU cores, ${memory}GB RAM).
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
      sandboxLog.warn("creation failed — continuing without sandbox", { err });
      const errorMsg = err instanceof Error ? err.message : String(err);
      system += `\n\n## Sandbox Initialization Error\nSandbox failed to initialize: "${errorMsg}". If the user asks to run a command or execute code, explain to them that the sandbox failed to initialize with this reason.`;
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
  // Route to the correct provider based on model id.
  const providerName = resolveProvider(modelId);

  // Use the server-side env key for the provider (Fireworks).
  const envKey = PROVIDER_ENV_KEYS[providerName];
  const resolvedKey = process.env[envKey];

  if (!resolvedKey) {
    return NextResponse.json(
      { error: `${envKey} is not set. Add it to your environment variables.` },
      { status: 500 },
    );
  }

  function canUseModel(candidateModelId: string): boolean {
    const candidateProvider = resolveProvider(candidateModelId);
    const envKey = PROVIDER_ENV_KEYS[candidateProvider];
    return !!process.env[envKey];
  }

  /**
   * Fallback candidates when the primary model cannot continue. The current
   * model goes first, then the rest of the catalog in order.
   *
   * Chat turns used to get no chain at all — `[modelId]` — so one provider hiccup
   * meant a 20 second wait, one retry, then an error, while an agent turn in the
   * same situation quietly moved to the next model. Only the agent-capable
   * filter is actually mode-specific: a chat turn calls no tools, so any model
   * with a configured key can take over.
   */
  function attemptModelIds(): string[] {
    const candidates = [
      modelId,
      ...defaultModels.map((m) => m.id).filter((id) => id !== modelId),
    ];

    const usable = Array.from(new Set(candidates)).filter(canUseModel);
    return tools ? usable.filter(isAgentCapable) : usable;
  }

  function createProviderForModel(candidateModelId: string) {
    const candidateProvider = resolveProvider(candidateModelId);
    const candidateResolvedModelId = stripProviderPrefix(candidateModelId);

    const envKey = PROVIDER_ENV_KEYS[candidateProvider];
    const candidateKey = process.env[envKey];
    const candidateBaseURL =
      process.env[`${envKey.replace("_API_KEY", "_BASE_URL")}`] ||
      PROVIDER_BASE_URLS[candidateProvider];

    if (!candidateKey) {
      throw new Error(`No API key configured for ${candidateProvider}`);
    }

    const candidateOpenAI = createOpenAI({
      baseURL: candidateBaseURL,
      apiKey: candidateKey,
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

  // Extract base64 images from last message, and strip/placeholder them from previous messages to avoid token bloat.
  const processedMessages = trimmedMessages.map((m, idx) => {
    const isLast = idx === trimmedMessages.length - 1;
    if (m.role !== "user") return m;

    let textContent = "";
    const fileParts: UIMessage["parts"] = [];

    // 1. Gather text content and existing file parts
    if (Array.isArray(m.parts)) {
      m.parts.forEach((p) => {
        if (p.type === "text") {
          textContent += p.text;
        } else if (p.type === "file") {
          if (isLast) {
            fileParts.push(p);
          } else {
            textContent += "\n[Image Attachment]";
          }
        }
      });
    } else {
      const legacyMessage = m as UIMessage & { content?: unknown };
      textContent =
        typeof legacyMessage.content === "string" ? legacyMessage.content : "";
    }

    // 2. Parse any markdown images embedded in the text (e.g. from restored Supabase content)
    const mdImageRegex = /!\[(.*?)\]\((data:(image\/.*?);base64,(.*?))\)/g;
    const cleanText = textContent.replace(mdImageRegex, (fullMatch, filename, dataUrl, mediaType) => {
      if (isLast) {
        if (!fileParts.some((fp) => fp.type === "file" && fp.url === dataUrl)) {
          fileParts.push({
            type: "file" as const,
            mediaType,
            url: dataUrl,
            filename: filename || undefined,
          });
        }
        return "";
      }
      return "[Image Attachment]";
    });

    // 3. Reconstruct newParts array
    const newParts: UIMessage["parts"] = [];
    if (cleanText.trim() || fileParts.length === 0) {
      newParts.push({
        type: "text",
        text: cleanText.trim(),
      });
    }
    newParts.push(...fileParts);

    return {
      ...m,
      parts: newParts,
    };
  });

  // Tracked outside the try so the catch below can tear down a run that was
  // registered but never handed to the background driver. Left dangling, such
  // a run would answer resume probes as "still working" until the watchdog.
  let unstartedRun: AgentRun | null = null;
  // The atomic credit reservation for this turn. Settled exactly once: by
  // finalizeSuccessfulTurn (success), the run driver's finalize (failure/
  // abort), or the catch below (run never started).
  let reservation: CreditReservation | null = null;
  let reservationSettled = false;

  try {
    const modelMessages = await convertToModelMessages(processedMessages);
    // Agent tasks generate large tool call arguments (e.g. full file content
    // in write_file). 32k gives enough room for reasoning + multi-file writes.
    // Per-model caps from Fireworks docs are applied via maxOutputFor() —
    // e.g. Qwen 3.7 Plus is capped at 4k. DeepSeek V4 Pro/Flash and GLM 5.2
    // also use reasoning tokens that eat into the budget.
    const maxOutputTokens = tools ? 32768 : 8192;
    /**
     * The in-flight (or finished) sandbox deletion, memoised.
     *
     * This used to be a `sandboxCleaned` boolean, which was fine while the only
     * caller ran at the very end of the turn. The sandbox is now released early
     * — before follow-up generation — on turns that used tools, so a second
     * caller has to be able to AWAIT that delete instead of stepping over a
     * half-finished one and letting the request end mid-flight.
     */
    let sandboxCleanup: Promise<void> | null = null;
    let finishedSuccessfully = false;
    let totalToolCount = 0;
    let lastAttemptToolCount = 0;
    let lastAttemptText = "";
    let lastFinishReason = "";
    let finalModelId = modelId;

    // ── Detached run ─────────────────────────────────────────────────────
    // The generation is registered as a background run and the HTTP response
    // is merely one subscriber to it. If the user closes the tab the response
    // stream dies; the run keeps going, persists its own assistant message,
    // and can be re-attached to via GET /api/chat/<id>/stream.
    const run = createRun({
      conversationId,
      userId,
      messageId: crypto.randomUUID(),
    });
    unstartedRun = run;

    // Atomic reservation — the authoritative credit gate. Placed after
    // createRun so the catch below owns cleanup of both on any throw.
    reservation = await reserveSpend(userId, turnKind);
    // Every write that outlives the request goes through the service-role
    // client — the request-scoped one is tied to cookies from a connection
    // that may already be gone.
    const adminDb = createAdminClient();

    async function markConversationIdle() {
      await adminDb
        .from("conversations")
        .update({ status: "idle", updated_at: new Date().toISOString() })
        .eq("id", conversationId);
    }

    /**
     * Persist the finished assistant turn server-side, keyed by the run's
     * message id. Upserting on (conversation_id, client_message_id) makes this
     * idempotent with the client's own save when a tab is still attached.
     */
    async function persistAssistantMessage(message: {
      parts?: unknown[];
      metadata?: unknown;
    }) {
      const parts = Array.isArray(message.parts) ? message.parts : [];
      const content = parts
        .map((p) =>
          p && typeof p === "object" && (p as { type?: string }).type === "text"
            ? ((p as { text?: string }).text ?? "")
            : "",
        )
        .join("");

      const { error } = await adminDb.from("messages").upsert(
        {
          conversation_id: conversationId,
          role: "assistant",
          content,
          parts,
          client_message_id: run.messageId,
          metadata: message.metadata ?? null,
        },
        {
          onConflict: "conversation_id,client_message_id",
          ignoreDuplicates: false,
        },
      );

      if (error) {
        log.error("assistant save failed", { conversationId, err: error.message });
        return;
      }
      log.info("assistant turn persisted", {
        conversationId,
        messageId: run.messageId,
        partsLen: parts.length,
      });
    }

    // End of turn deletes the sandbox immediately — an idle sandbox holds a
    // multi-GiB slot of the org quota for nothing. The conversation label +
    // the reuse lookup above still earn their keep: a run that dies before
    // reaching cleanup (crash, server restart) leaves an orphan, and the
    // NEXT turn adopts it instead of stacking a second sandbox. Orphans
    // nobody adopts are reaped by Daytona (autoStop 5 min → autoDelete 0).
    function cleanupSandbox(reason: string): Promise<void> {
      if (!sandbox) return Promise.resolve();
      // Every caller awaits the same delete rather than the first one winning
      // and the rest returning immediately — see sandboxCleanup above.
      if (sandboxCleanup) return sandboxCleanup;

      // Pin the target. `sandbox` is reassigned by onSandboxReplaced, and this
      // function no longer runs to completion synchronously with its own call,
      // so reading the field again later could delete the wrong one.
      const doomed = sandbox;

      // Tombstone before the call, not after: the id must be unadoptable from
      // the instant we commit to destroying it. A concurrent request can reach
      // the label lookup while delete() is still in flight, which is how a
      // 111ms-old corpse got reused in production. Marking a sandbox whose
      // delete then fails is the safe direction — the next turn simply creates
      // a fresh one instead of gambling on a half-dead slot.
      markSandboxDeleted(doomed.id);

      sandboxCleanup = (async () => {
        try {
          await doomed.delete();
          sandboxLog.info("deleted", { sandboxId: doomed.id, reason });
        } catch (err) {
          sandboxLog.warn("cleanup failed", { sandboxId: doomed.id, err });
        }
      })();
      return sandboxCleanup;
    }

    async function finalizeSuccessfulTurn() {
      if (finishedSuccessfully) return;
      finishedSuccessfully = true;

      await markConversationIdle();

      try {
        reservationSettled = true;
        await settleSpend({
          userId,
          conversationId,
          kind: turnKind,
          toolCount: totalToolCount,
          modelId: finalModelId,
          reservation: reservation ?? { reserved: 0 },
          success: true,
        });
      } catch (err) {
        log.error("settleSpend failed", { conversationId, userId, err });
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

    // AgentState accumulator — filled in startAttempt's onFinish (LLM semantic
    // report from report_state + orchestrator-derived execution status), then
    // emitted as message metadata before the turn ends. Declared in this scope
    // so both startAttempt (writer of the value) and the execute loop (reader
    // that writes the metadata chunk) can reach it.
    let pendingAgentState: AgentCompletionState | null = null;

    function startAttempt(candidateModelId: string, attemptIndex: number) {
      const candidate = createProviderForModel(candidateModelId);
      const recoveryInstruction = wantsAgent
        ? "Inspect the current repo/branch and sandbox state first, reuse completed work, avoid duplicate commits or PRs, and finish the user's request. Continue silently through tool calls without narrating progress, then provide one concise final response."
        : "Continue the same user request. If documentation lookup was needed, use the available Context7 tool results or call the Context7 tools again as needed.";
      const recoverySystem =
        attemptIndex === 0
          ? system
          : `${system}\n\n## Current Recovery Attempt
The previous model attempt was interrupted by provider rate limits before it could finish. Continue the same task now with model \`${candidateModelId}\`.
${recoveryInstruction}`;

      return streamText({
        model: candidate.provider.chat(candidate.resolvedModelId),
        system: recoverySystem,
        messages: modelMessages,
        maxOutputTokens: maxOutputFor(candidateModelId, maxOutputTokens),
        // Keep retries conservative. Provider 429/quota errors are retryable to
        // the SDK, but repeating them can quickly turn one user action into many
        // failed attempts. Override with AI_CHAT_MAX_RETRIES only if needed.
        maxRetries: chatMaxRetries(),
        // Deliberately NOT req.signal: the run is detached from the request, so
        // closing the tab or navigating away must not kill a 20-tool-call agent
        // turn. Only an explicit stop (DELETE /api/chat/<id>/stream), a
        // superseding turn, or the registry watchdog aborts this.
        abortSignal: run.abortController.signal,
        // Agent mode: enable tools + multi-step loop. Cap at 50 steps so
        // complex tasks (multi-file build/fix loops) can finish instead of
        // stopping mid-work at 15.
        ...(tools
          ? {
              tools,
              stopWhen: [stepCountIs(50), stopOnToolFailure],
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

          // AgentState is NOT derived here — it is derived in pipeAttemptToWriter
          // after the stream reader is done, where result.steps/result.finishReason
          // are final and the writer is in scope. This avoids the race between the
          // async onFinish callback and the reader 'done' signal.

          // The assistant message is NOT saved here. The background driver
          // persists it once the whole run settles (persistAssistantMessage),
          // with the full UIMessage parts, so the timeline survives a reload
          // even when nobody was watching. A client that is still attached
          // also saves it, but under the same run.messageId — the upsert
          // collapses both onto one row.

          // ── Async memory extraction (non-blocking) ────────────────────
          // Scheduled via detachTask: after() when a request scope is still
          // available (Vercel needs it to keep the function alive), otherwise
          // straight fire-and-forget — this callback often runs after the
          // response is gone now that the turn is a detached run.
          if (userText && text) {
            detachTask("memory extraction", () =>
              extractAndSaveMemories(userId, userText, text),
            );
          }

          // Structured JSONB profile extraction (uses Fireworks LLM if available)
          if (process.env.FIREWORKS_API_KEY && userText && text) {
            detachTask("structured memory extraction", () =>
              extractAndSaveStructuredMemory(userId, userText, text),
            );
          }
        },
      });
    }

    async function pipeAttemptToWriter(
      writer: { write: (part: UIMessageChunk) => void },
      candidateModelId: string,
      attemptIndex: number,
    ): Promise<"completed" | "rate_limited" | "transient"> {
      const result = startAttempt(candidateModelId, attemptIndex);
      const stream = result.toUIMessageStream({
        onError: (error) => formatInferenceError(error).message,
        // Pin the assistant message id to the run's. Every client that attaches
        // (original tab, resumed tab) adopts it via the `start` chunk, and the
        // server persists under the same id — so a client-side save and the
        // server-side save collapse onto one row instead of duplicating.
        generateMessageId: () => run.messageId,
      });
      const reader = stream.getReader();
      let completed = false;

      // Whether the user has already seen output from this attempt. A restart
      // after that point would replay text on top of what is on screen, so a
      // transient failure mid-answer is surfaced rather than silently retried.
      let wroteAnyChunk = false;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) { completed = true; break; }

          if (value.type === "error" && isRateLimitMessage(value.errorText)) {
            return "rate_limited";
          }

          writer.write(value);
          wroteAnyChunk = true;
        }
      } catch (err) {
        if (isRateLimitFailure(err)) return "rate_limited";
        if (isTransientFailure(err) && !wroteAnyChunk) return "transient";
        throw err;
      } finally {
        reader.releaseLock();
      }

      // ── Derive + emit AgentState here (single source of truth) ──
      // The stream reader is done, so result.steps / result.finishReason are
      // final. The writer is in scope. No race with onFinish (we read the
      // awaited promises directly). Emit once as a message-metadata chunk so
      // the client attaches it to the assistant message.
      if (completed) {
        try {
          const [steps, finishReason, finalText] = await Promise.all([
            result.steps,
            result.finishReason,
            result.text,
          ]);
          pendingAgentState = deriveAgentState(
            steps ?? [],
            finishReason,
            candidateModelId,
            userText,
            totalToolCount,
          );
          // Release the sandbox before generating chips, not after.
          //
          // Follow-up generation takes ~9s and needs nothing but text, yet the
          // only cleanupSandbox call used to sit in finalizeSuccessfulTurn,
          // downstream of it. Measured in production: chips finished at
          // :07.990 and the sandbox was not deleted until :09.833 — a 2 vCPU /
          // 4 GB box held roughly nine seconds past its last use, every agent
          // turn.
          //
          // Gated on this attempt having called at least one tool, which is
          // exactly the condition that makes early release safe. A "completed"
          // attempt can still be re-run by shouldRecoverStalledAgentAttempt(),
          // and that retry would need the sandbox — but it bails out at
          // `lastAttemptToolCount > 0`, so a turn that used tools is never
          // retried. Turns that used none keep the old timing; they never
          // touched the sandbox anyway.
          //
          // Counted from the awaited `steps` rather than lastAttemptToolCount:
          // that mutable is written by streamText's onFinish, which races the
          // reader's done signal (see the note where it is assigned). The
          // awaited value is the one that is guaranteed final here.
          //
          // Deliberately not awaited. Waiting on delete() would just move the
          // ~1.8s it costs in front of the chips instead of behind them;
          // finalizeSuccessfulTurn awaits the same memoised promise later.
          const attemptToolCount = (steps ?? []).reduce(
            (sum, step) => sum + (step.toolCalls?.length ?? 0),
            0,
          );
          if (attemptToolCount > 0) {
            void cleanupSandbox("after tool use — released before follow-ups");
          }

          // Follow-up priority: (1) planner's report_state.suggestedActions,
          // already set inside deriveAgentState; (2) a small structured call
          // over the finished turn. Only generate when the planner gave nothing
          // — never overwrite its own offers, and never pay for a call we do
          // not need. The reply has already streamed by this point, so this
          // delays the chips appearing, not the text.
          if (pendingAgentState && !pendingAgentState.suggestedActions?.length) {
            pendingAgentState.followUps = await generateFollowUps({
              userText,
              assistantText: finalText,
              taskType: pendingAgentState.taskType,
            });
          }
          const durationMs = Date.now() - turnStartedAt;
          if (pendingAgentState) {
            log.info("agent state emitted", {
              conversationId,
              taskType: pendingAgentState.taskType,
              status: pendingAgentState.status,
              nextCapabilities: pendingAgentState.nextCapabilities,
              suggestedActions: pendingAgentState.suggestedActions?.length ?? 0,
              followUps: pendingAgentState.followUps?.length ?? 0,
            });
            writer.write({
              type: "message-metadata",
              messageMetadata: { agentState: pendingAgentState, durationMs },
            });
          } else {
            log.debug("no agent state derived", { conversationId });
            // Still emit the duration so the timeline can show elapsed time.
            writer.write({
              type: "message-metadata",
              messageMetadata: { durationMs },
            });
          }
        } catch (stateErr) {
          // A user-stopped run rejects result.steps with AbortError — that's
          // the expected outcome of pressing Stop, not a failure worth a
          // stack trace in the logs.
          if ((stateErr as Error)?.name === "AbortError") {
            log.debug("agent state skipped — run was stopped", { conversationId });
          } else {
            log.warn("agent state derive/emit failed", { conversationId, err: stateErr });
          }
        }
        return "completed";
      }
      return "completed";
    }

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const attempts = attemptModelIds();
        let lastRateLimit = false;
        let recoveryRetriesUsed = 0;
        let transientRetriesUsed = 0;
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
            // AgentState metadata is already emitted inside pipeAttemptToWriter
            // (single source of truth) right after the stream reader is done and
            // result.steps/result.finishReason are final. No duplicate emit here.
            return;
          }

          // A connection that died before producing any output. The model
          // never answered, so nothing is on screen to duplicate — quietly try
          // again instead of turning a passing blip into a visible failure.
          if (result === "transient") {
            if (transientRetriesUsed < transientRetries()) {
              transientRetriesUsed++;
              const waitMs = transientRetryDelayMs();
              log.warn("transient provider failure — retrying", {
                conversationId,
                modelId: attemptModelId,
                attempt: transientRetriesUsed,
                waitMs,
              });
              await sleep(waitMs);
              continue;
            }

            const nextAfterTransient = attempts[i + 1];
            if (nextAfterTransient) {
              log.warn("transient failures exhausted — switching model", {
                conversationId,
                from: attemptModelId,
                to: nextAfterTransient,
              });
              transientRetriesUsed = 0;
              i++;
              continue;
            }

            await markConversationIdle();
            await cleanupSandbox("after transient failures");
            throw new Error(
              "Koneksi ke provider model terputus dan percobaan ulang tidak berhasil. Coba lagi sebentar lagi.",
            );
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
      generateId: () => run.messageId,
    });

    // Hand the stream to the background driver. It fans chunks out to the run
    // registry, folds them into the assistant message, persists that message,
    // and settles credits + sandbox — all without a client attached.
    // From here the driver owns the run's lifecycle.
    unstartedRun = null;
    driveRunInBackground({
      run,
      stream,
      persistMessage: persistAssistantMessage,
      finalize: async (outcome) => {
        // finalizeSuccessfulTurn already ran for a clean turn; this covers the
        // aborted/failed paths so the conversation never stays "processing",
        // the sandbox never leaks, and the credit reservation is refunded —
        // failed and stopped turns stay free.
        if (!finishedSuccessfully) {
          await markConversationIdle();
          if (reservation && !reservationSettled) {
            reservationSettled = true;
            await settleSpend({
              userId,
              conversationId,
              kind: turnKind,
              toolCount: totalToolCount,
              modelId: finalModelId,
              reservation,
              success: false,
            });
          }
          await cleanupSandbox(`after run ${outcome}`);
        }
      },
    });

    return createUIMessageStreamResponse({
      stream: subscribeToRun(run),
      headers: {
        "X-Accel-Buffering": "no",
        "Cache-Control": "no-cache, no-transform",
        "X-Conversation-Id": conversationId,
      },
    });
  } catch (err) {
    // Nothing is driving this run, so retire it rather than let it advertise
    // itself as resumable — and give the credit reservation back, since no
    // model work happened.
    if (unstartedRun) {
      endRun(unstartedRun, "failed");
      if (reservation && !reservationSettled) {
        reservationSettled = true;
        await settleSpend({
          userId,
          conversationId,
          kind: turnKind,
          toolCount: 0,
          modelId,
          reservation,
          success: false,
        }).catch(() => {});
      }
    }

    if (err instanceof OutOfCreditsError) {
      return NextResponse.json(
        { error: err.message, code: "out_of_credits", credits: err.snapshot },
        { status: 402 },
      );
    }

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
