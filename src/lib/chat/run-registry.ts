import type { UIMessageChunk } from "ai";

/**
 * In-memory registry of *detached* agent runs.
 *
 * The point: an agent turn must outlive the HTTP request that started it.
 * Closing the tab or navigating away kills the response stream, not the work.
 * The route pushes every UI message chunk into a run here; the response is
 * just one subscriber. When the user comes back, `GET /api/chat/<id>/stream`
 * subscribes again, replays what the run has produced so far, and continues
 * live.
 *
 * Scope + limits (deliberate, and covered by a fallback):
 *  - Process-local. A run lives in the Node process that started it, so this
 *    works on a persistent deployment (Docker/Coolify — the production target)
 *    and NOT across multiple replicas or on serverless-per-request platforms.
 *  - Lost on restart. If the container restarts mid-run the work is gone.
 * In both cases the client falls back to polling `conversations/<id>/status`
 * and reloading from the database, which is why the run also persists its
 * assistant message server-side when it finishes.
 */

export type AgentRunStatus = "running" | "completed" | "failed" | "aborted";

type Subscriber = {
  enqueue: (chunk: UIMessageChunk) => void;
  close: () => void;
};

export type AgentRun = {
  runId: string;
  conversationId: string;
  userId: string;
  /**
   * Server-assigned id for the assistant message this run produces. Emitted in
   * the stream's `start` chunk so every client that attaches adopts it, and
   * reused as the idempotency key when the message is persisted — so the
   * server's save and a client's save collapse onto the same row.
   */
  messageId: string;
  /** Append-only chunk log used to replay the run to late subscribers. */
  chunks: UIMessageChunk[];
  bufferedBytes: number;
  /** True once the log outgrew MAX_REPLAY_BYTES and replay was given up. */
  replayTruncated: boolean;
  status: AgentRunStatus;
  abortController: AbortController;
  subscribers: Set<Subscriber>;
  startedAt: number;
  watchdog?: ReturnType<typeof setTimeout>;
};

/**
 * Cap on the replay log per run. Tool results (file reads, command output) are
 * the bulk of it. Past the cap we keep streaming live but stop buffering, and
 * resume degrades to the database-reload fallback rather than replaying a
 * partial message.
 */
const MAX_REPLAY_BYTES = 32 * 1024 * 1024;

/** Hard ceiling on a single run, so a wedged agent can't leak forever. */
const MAX_RUN_MS = 30 * 60 * 1000;

// Survive dev-mode hot reloads: a fresh module instance would otherwise orphan
// every in-flight run.
const globalStore = globalThis as unknown as {
  __celiuzAgentRuns?: Map<string, AgentRun>;
};
const runsByConversation: Map<string, AgentRun> =
  globalStore.__celiuzAgentRuns ?? new Map<string, AgentRun>();
globalStore.__celiuzAgentRuns = runsByConversation;

function estimateChunkSize(chunk: UIMessageChunk): number {
  const c = chunk as { type?: string; delta?: unknown; text?: unknown };
  // Text deltas dominate by count but are tiny — skip the stringify for them.
  if (typeof c.delta === "string") return c.delta.length + 32;
  if (typeof c.text === "string") return c.text.length + 32;
  try {
    return JSON.stringify(chunk).length;
  } catch {
    return 1024;
  }
}

/**
 * Register a new run for a conversation. Any run already in flight for the
 * same conversation is aborted first — a new turn supersedes the old one.
 */
export function createRun(opts: {
  conversationId: string;
  userId: string;
  messageId: string;
}): AgentRun {
  const existing = runsByConversation.get(opts.conversationId);
  if (existing && existing.status === "running") {
    abortRun(existing, "superseded by a new turn");
  }

  const run: AgentRun = {
    runId: crypto.randomUUID(),
    conversationId: opts.conversationId,
    userId: opts.userId,
    messageId: opts.messageId,
    chunks: [],
    bufferedBytes: 0,
    replayTruncated: false,
    status: "running",
    abortController: new AbortController(),
    subscribers: new Set(),
    startedAt: Date.now(),
  };

  run.watchdog = setTimeout(() => {
    if (run.status === "running") {
      console.warn(
        `[run-registry] run ${run.runId} exceeded ${MAX_RUN_MS}ms — aborting`,
      );
      abortRun(run, "exceeded maximum run duration");
    }
  }, MAX_RUN_MS);
  // Never keep the process alive just for the watchdog.
  run.watchdog.unref?.();

  runsByConversation.set(opts.conversationId, run);
  return run;
}

/** Append a chunk to the replay log and fan it out to attached subscribers. */
export function publishChunk(run: AgentRun, chunk: UIMessageChunk): void {
  if (!run.replayTruncated) {
    const size = estimateChunkSize(chunk);
    if (run.bufferedBytes + size > MAX_REPLAY_BYTES) {
      // Give the memory back — a partial log can't be replayed faithfully.
      run.replayTruncated = true;
      run.chunks = [];
      run.bufferedBytes = 0;
      console.warn(
        `[run-registry] run ${run.runId} exceeded the replay buffer; resume will fall back to reloading from the database`,
      );
    } else {
      run.chunks.push(chunk);
      run.bufferedBytes += size;
    }
  }

  for (const subscriber of run.subscribers) {
    subscriber.enqueue(chunk);
  }
}

/** Mark a run finished, close every attached stream, and release its memory. */
export function endRun(run: AgentRun, status: Exclude<AgentRunStatus, "running">): void {
  if (run.status !== "running") return;
  run.status = status;

  if (run.watchdog) clearTimeout(run.watchdog);

  for (const subscriber of run.subscribers) {
    subscriber.close();
  }
  run.subscribers.clear();
  run.chunks = [];
  run.bufferedBytes = 0;

  if (runsByConversation.get(run.conversationId) === run) {
    runsByConversation.delete(run.conversationId);
  }
}

/** Abort a run's generation. The driver still persists whatever it produced. */
export function abortRun(run: AgentRun, reason: string): void {
  if (run.status !== "running") return;
  console.log(`[run-registry] aborting run ${run.runId}: ${reason}`);
  run.abortController.abort();
}

/**
 * The live run for a conversation, if the caller owns it and it can still be
 * replayed faithfully. Returns null for anything else — the caller answers
 * "nothing to resume" and the client falls back to polling.
 */
export function getResumableRun(
  conversationId: string,
  userId: string,
): AgentRun | null {
  const run = runsByConversation.get(conversationId);
  if (!run) return null;
  if (run.status !== "running") return null;
  if (run.userId !== userId) return null;
  if (run.replayTruncated) return null;
  return run;
}

/** The live run for a conversation owned by this user, replayable or not. */
export function getRunForConversation(
  conversationId: string,
  userId: string,
): AgentRun | null {
  const run = runsByConversation.get(conversationId);
  if (!run || run.status !== "running" || run.userId !== userId) return null;
  return run;
}

/**
 * Attach to a run: replays everything buffered so far, then follows it live.
 *
 * The replay loop runs inside the stream's synchronous `start`, so no chunk
 * can be published between the replay and the subscription being registered.
 */
export function subscribeToRun(run: AgentRun): ReadableStream<UIMessageChunk> {
  let subscriber: Subscriber | null = null;

  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of run.chunks) {
        controller.enqueue(chunk);
      }

      if (run.status !== "running") {
        controller.close();
        return;
      }

      subscriber = {
        enqueue: (chunk) => {
          try {
            controller.enqueue(chunk);
          } catch {
            // Subscriber went away mid-write; cancel() cleans up the entry.
          }
        },
        close: () => {
          try {
            controller.close();
          } catch {
            // Already closed.
          }
        },
      };
      run.subscribers.add(subscriber);
    },
    cancel() {
      if (subscriber) run.subscribers.delete(subscriber);
    },
  });
}

/** Test/diagnostic helper — number of runs currently in flight. */
export function activeRunCount(): number {
  return runsByConversation.size;
}
