import { readUIMessageStream, type UIMessage, type UIMessageChunk } from "ai";
import { publishChunk, endRun, type AgentRun, type AgentRunStatus } from "./run-registry";

/**
 * Drives an agent run to completion independently of the HTTP request that
 * started it.
 *
 * The UI message stream is split in two: one branch feeds the run registry
 * (live subscribers + replay log), the other is folded back into a complete
 * `UIMessage` so the server can persist the assistant turn itself. That second
 * branch is what makes a closed tab survivable — persistence no longer depends
 * on a client being around to send the message back.
 *
 * Nothing here throws into the caller: it is invoked fire-and-forget.
 */
export function driveRunInBackground(opts: {
  run: AgentRun;
  stream: ReadableStream<UIMessageChunk>;
  /** Persist the accumulated assistant message. Called once, before finalize. */
  persistMessage: (message: UIMessage) => Promise<void>;
  /** Release resources / settle billing. Always called exactly once. */
  finalize: (outcome: Exclude<AgentRunStatus, "running">) => Promise<void>;
}): void {
  const { run, stream, persistMessage, finalize } = opts;

  void (async () => {
    const [liveBranch, persistBranch] = stream.tee();

    let assistantMessage: UIMessage | undefined;
    let streamFailed = false;

    const pumpToRegistry = (async () => {
      const reader = liveBranch.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          publishChunk(run, value);
        }
      } finally {
        reader.releaseLock();
      }
    })();

    const accumulateMessage = (async () => {
      // terminateOnError:false so an error chunk still leaves us the partial
      // message — a run that died halfway is worth keeping.
      for await (const message of readUIMessageStream({
        stream: persistBranch,
        terminateOnError: false,
        onError: (error) => {
          streamFailed = true;
          console.error("[background-run] stream error:", error);
        },
      })) {
        assistantMessage = message;
      }
    })();

    let outcome: Exclude<AgentRunStatus, "running"> = "completed";

    try {
      await Promise.all([pumpToRegistry, accumulateMessage]);
      if (streamFailed) outcome = "failed";
    } catch (err) {
      outcome = "failed";
      console.error("[background-run] run failed:", err);
    }

    if (run.abortController.signal.aborted) outcome = "aborted";

    // Persist before ending the run: subscribers that are still attached see
    // the stream close only once the turn is durable.
    if (assistantMessage && hasContent(assistantMessage)) {
      try {
        await persistMessage({ ...assistantMessage, id: run.messageId });
      } catch (err) {
        console.error("[background-run] persist failed:", err);
      }
    }

    try {
      await finalize(outcome);
    } catch (err) {
      console.error("[background-run] finalize failed:", err);
    }

    endRun(run, outcome);
  })();
}

/** Skip persisting an empty shell (no text, no tool calls). */
function hasContent(message: UIMessage): boolean {
  return (message.parts ?? []).some((part) => {
    if (part.type === "text") return Boolean(part.text?.trim());
    return part.type === "dynamic-tool" || part.type.startsWith("tool-");
  });
}
