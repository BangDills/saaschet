import type { UIMessage, UIMessageChunk } from "ai";
import { driveRunInBackground } from "./background-run";
import { createRun, subscribeToRun, type AgentRun } from "./run-registry";
import { runSelfcheck } from "../selfcheck/watchdog";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

/** Emit chunks one macrotask apart so a subscriber can leave mid-stream. */
function chunkStream(chunks: UIMessageChunk[]): ReadableStream<UIMessageChunk> {
  let i = 0;
  return new ReadableStream<UIMessageChunk>({
    async pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      await new Promise((r) => setTimeout(r, 1));
      controller.enqueue(chunks[i++]);
    },
  });
}

function textTurn(text: string, metadata?: unknown): UIMessageChunk[] {
  return [
    { type: "start" },
    { type: "text-start", id: "t1" },
    { type: "text-delta", id: "t1", delta: text },
    { type: "text-end", id: "t1" },
    ...(metadata
      ? [{ type: "message-metadata", messageMetadata: metadata } as UIMessageChunk]
      : []),
    { type: "finish" },
  ] as UIMessageChunk[];
}

type Capture = {
  persisted: UIMessage | null;
  outcome: string | null;
  done: Promise<void>;
};

let seq = 0;
function drive(chunks: UIMessageChunk[]): { run: AgentRun; capture: Capture } {
  seq++;
  const run = createRun({
    conversationId: `conv-bg-${seq}`,
    userId: "user-1",
    messageId: `msg-bg-${seq}`,
  });

  let resolveDone!: () => void;
  const capture: Capture = {
    persisted: null,
    outcome: null,
    done: new Promise<void>((resolve) => {
      resolveDone = resolve;
    }),
  };

  driveRunInBackground({
    run,
    stream: chunkStream(chunks),
    persistMessage: async (message) => {
      capture.persisted = message;
    },
    finalize: async (outcome) => {
      capture.outcome = outcome;
      resolveDone();
    },
  });

  return { run, capture };
}

/**
 * Let the driver's own continuation run. `finalize` resolves before the driver
 * calls endRun — deliberately, so persistence lands before attached streams
 * close — so anything asserting on run status must yield first.
 */
function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 5));
}

function textOf(message: UIMessage | null): string {
  if (!message) return "";
  return (message.parts ?? [])
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("");
}

async function main() {
  // 1. The whole point: with NO subscriber ever attached — the tab was closed
  //    before the turn finished — the run still completes and persists.
  {
    const { run, capture } = drive(textTurn("finished without a client"));
    await capture.done;
    assert(capture.outcome === "completed", "unwatched run completes");
    assert(
      textOf(capture.persisted) === "finished without a client",
      "unwatched run persists its assistant message",
    );
    assert(
      capture.persisted?.id === run.messageId,
      "persisted message carries the run's server-assigned id",
    );
    await tick();
    assert(run.status === "completed", "run ends after persisting");
  }

  // 2. A subscriber that leaves mid-stream does not stop the run.
  {
    const { run, capture } = drive(textTurn("kept going after tab closed"));
    const reader = subscribeToRun(run).getReader();
    await reader.read(); // consume one chunk, then walk away
    await reader.cancel();
    assert(run.subscribers.size === 0, "subscriber detached");

    await capture.done;
    assert(capture.outcome === "completed", "run completes after subscriber left");
    assert(
      textOf(capture.persisted) === "kept going after tab closed",
      "full message persisted despite the client leaving",
    );
  }

  // 3. Message metadata (agentState / durationMs) survives into persistence.
  {
    const { capture } = drive(textTurn("with metadata", { durationMs: 4200 }));
    await capture.done;
    const meta = capture.persisted?.metadata as { durationMs?: number } | undefined;
    assert(meta?.durationMs === 4200, "metadata reaches the persisted message");
  }

  // 4. An empty turn is not persisted (no row for a turn that produced nothing).
  {
    const { capture } = drive([
      { type: "start" },
      { type: "finish" },
    ] as UIMessageChunk[]);
    await capture.done;
    assert(capture.persisted === null, "empty turn is not persisted");
    assert(capture.outcome === "completed", "empty turn still finalizes");
  }

  // 5. An error chunk yields a failed outcome, but partial work is still kept.
  {
    const { capture } = drive([
      { type: "start" },
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", delta: "partial work" },
      { type: "text-end", id: "t1" },
      { type: "error", errorText: "provider exploded" },
    ] as UIMessageChunk[]);
    await capture.done;
    assert(capture.outcome === "failed", "error chunk marks the run failed");
    assert(
      textOf(capture.persisted) === "partial work",
      "partial output is persisted even on failure",
    );
  }

  // 6. A stopped run reports "aborted" and keeps what it produced.
  {
    const { run, capture } = drive(textTurn("work before stop"));
    run.abortController.abort();
    await capture.done;
    assert(capture.outcome === "aborted", "aborted run reports aborted");
    assert(
      textOf(capture.persisted) === "work before stop",
      "aborted run still persists its partial turn",
    );
  }

  // 7. finalize runs exactly once per run.
  {
    let calls = 0;
    const run = createRun({
      conversationId: "conv-bg-once",
      userId: "user-1",
      messageId: "msg-bg-once",
    });
    await new Promise<void>((resolve) => {
      driveRunInBackground({
        run,
        stream: chunkStream(textTurn("once")),
        persistMessage: async () => {},
        finalize: async () => {
          calls++;
          resolve();
        },
      });
    });
    await new Promise((r) => setTimeout(r, 20));
    assert(calls === 1, `finalize called exactly once (got ${calls})`);
  }

  console.log("PASS: 7/7 background-run selfcheck cases (survives a closed tab)");
}

runSelfcheck(main, "background-run selfcheck");
