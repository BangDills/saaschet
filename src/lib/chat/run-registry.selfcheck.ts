import type { UIMessageChunk } from "ai";
import {
  createRun,
  publishChunk,
  endRun,
  abortRun,
  getResumableRun,
  getRunForConversation,
  subscribeToRun,
  activeRunCount,
  type AgentRun,
} from "./run-registry";
import { runSelfcheck } from "../selfcheck/watchdog";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

function textChunk(text: string): UIMessageChunk {
  return { type: "text-delta", id: "t1", delta: text } as UIMessageChunk;
}

/** Read exactly `count` chunks; rejects rather than hanging if the stream ends. */
async function read(
  reader: ReadableStreamDefaultReader<UIMessageChunk>,
  count: number,
): Promise<UIMessageChunk[]> {
  const out: UIMessageChunk[] = [];
  for (let i = 0; i < count; i++) {
    const { done, value } = await reader.read();
    if (done) throw new Error(`stream closed after ${out.length}/${count} chunks`);
    out.push(value);
  }
  return out;
}

function deltaOf(chunk: UIMessageChunk): string {
  return (chunk as { delta?: string }).delta ?? "";
}

let convSeq = 0;
function newRun(userId = "user-1"): AgentRun {
  convSeq++;
  return createRun({
    conversationId: `conv-${convSeq}`,
    userId,
    messageId: `msg-${convSeq}`,
  });
}

async function main() {
  // 1. A new run is registered and resumable by its owner.
  const run1 = newRun();
  assert(run1.status === "running", "new run is running");
  assert(
    getResumableRun(run1.conversationId, "user-1") === run1,
    "owner can resume their run",
  );

  // 2. Ownership is enforced — another user cannot attach to it.
  assert(
    getResumableRun(run1.conversationId, "user-2") === null,
    "non-owner cannot resume",
  );

  // 3. A late subscriber replays everything buffered before it attached.
  publishChunk(run1, textChunk("a"));
  publishChunk(run1, textChunk("b"));
  const late = subscribeToRun(run1).getReader();
  const replayed = await read(late, 2);
  assert(
    replayed.map(deltaOf).join("") === "ab",
    "late subscriber replays buffered chunks",
  );

  // 4. ...and then follows the run live.
  publishChunk(run1, textChunk("c"));
  const live = await read(late, 1);
  assert(deltaOf(live[0]) === "c", "subscriber receives live chunks");

  // 5. Two subscribers both receive the same live chunk (original tab + resumed tab).
  const second = subscribeToRun(run1).getReader();
  const secondReplay = await read(second, 3);
  assert(
    secondReplay.map(deltaOf).join("") === "abc",
    "second subscriber replays full history",
  );
  publishChunk(run1, textChunk("d"));
  const [firstLive, secondLive] = await Promise.all([
    read(late, 1),
    read(second, 1),
  ]);
  assert(
    deltaOf(firstLive[0]) === "d" && deltaOf(secondLive[0]) === "d",
    "both subscribers receive the same live chunk",
  );

  // 6. Ending the run closes attached streams and deregisters it.
  endRun(run1, "completed");
  assert((await late.read()).done === true, "subscriber stream closes on end");
  assert(
    getResumableRun(run1.conversationId, "user-1") === null,
    "finished run is not resumable",
  );
  assert(run1.status === "completed", "status recorded");

  // 7. endRun is idempotent — a second call must not flip a recorded outcome.
  endRun(run1, "failed");
  assert(run1.status === "completed", "endRun does not overwrite the outcome");

  // 8. Subscribing to an already-finished run replays nothing and closes.
  const afterEnd = subscribeToRun(run1).getReader();
  assert((await afterEnd.read()).done === true, "finished run yields a closed stream");

  // 9. A new turn for the same conversation supersedes (aborts) the old run.
  const conversationId = "conv-shared";
  const older = createRun({ conversationId, userId: "user-1", messageId: "m1" });
  const newer = createRun({ conversationId, userId: "user-1", messageId: "m2" });
  assert(older.abortController.signal.aborted, "superseded run is aborted");
  assert(
    getResumableRun(conversationId, "user-1") === newer,
    "the newest run owns the conversation",
  );
  endRun(newer, "completed");

  // 10. Explicit stop aborts the signal but leaves the run for its driver to
  //     settle (so partial work still gets persisted).
  const stoppable = newRun();
  abortRun(stoppable, "stopped by user");
  assert(stoppable.abortController.signal.aborted, "abortRun signals the controller");
  assert(stoppable.status === "running", "abortRun leaves finalization to the driver");
  endRun(stoppable, "aborted");

  // 11. Cancelling a subscriber detaches it without disturbing the run.
  const cancelRun = newRun();
  const stream = subscribeToRun(cancelRun);
  const reader = stream.getReader();
  assert(cancelRun.subscribers.size === 1, "subscriber registered");
  await reader.cancel();
  assert(cancelRun.subscribers.size === 0, "cancelled subscriber is detached");
  publishChunk(cancelRun, textChunk("x"));
  assert(cancelRun.status === "running", "run survives a subscriber leaving");
  endRun(cancelRun, "completed");

  // 12. getRunForConversation finds a live run regardless of replay state,
  //     while getResumableRun refuses one whose replay buffer overflowed.
  const truncated = newRun();
  truncated.replayTruncated = true;
  assert(
    getRunForConversation(truncated.conversationId, "user-1") === truncated,
    "stop lookup finds a truncated run",
  );
  assert(
    getResumableRun(truncated.conversationId, "user-1") === null,
    "truncated run is not resumable (falls back to DB reload)",
  );
  // getRunForConversation gates DELETE /api/chat/[id]/stream — the stop button.
  // Only its happy path was pinned, so collapsing its `||` chain to `&&` (which
  // hands any caller someone else's run) passed every case here. Stopping
  // another user's generation only needs their conversation id.
  assert(
    getRunForConversation(truncated.conversationId, "user-2") === null,
    "stop lookup refuses a run owned by another user",
  );
  endRun(truncated, "completed");
  assert(
    getRunForConversation(truncated.conversationId, "user-1") === null,
    "stop lookup refuses a finished run",
  );

  // 13. Oversized output trips truncation instead of growing without bound.
  const big = newRun();
  publishChunk(big, textChunk("x".repeat(33 * 1024 * 1024)));
  assert(big.replayTruncated, "oversized chunk trips the replay cap");
  assert(big.chunks.length === 0, "replay buffer released on truncation");
  const stillLive = subscribeToRun(big).getReader();
  publishChunk(big, textChunk("still-live"));
  assert(
    deltaOf((await read(stillLive, 1))[0]) === "still-live",
    "truncated run still streams live to attached subscribers",
  );
  endRun(big, "completed");

  // 14. Every run created here has been cleaned up.
  assert(activeRunCount() === 0, `no runs leaked (found ${activeRunCount()})`);

  console.log("PASS: 14/14 run-registry selfcheck cases (detached runs + resume)");
}

runSelfcheck(main, "run-registry selfcheck");
