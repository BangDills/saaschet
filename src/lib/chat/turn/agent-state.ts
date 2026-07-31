import type { StopCondition } from "ai";
import type { AgentCompletionState } from "@/lib/agent/action-registry";
import { createLogger } from "@/lib/logger";

/**
 * Agent turn outcome: what the orchestrator halts on, and how a finished
 * turn is summarized into the AgentCompletionState the UI reads.
 *
 * Extracted from the chat route so the halting policy and the state
 * derivation can be reasoned about (and tested) without the 1800-line
 * request handler around them.
 */

const log = createLogger("agent-state");

/**
 * Halt orchestration ONLY on FATAL tool failures. The agent must stay
 * autonomous: an ambiguous/recoverable failure (build error, merge conflict,
 * stale cache, transient timeout, wrong branch) is a signal to RE-PLAN and
 * try another tool or fix+retry — NOT a reason to stop and hand back to the
 * user. Reliability means "don't fabricate results", not "stop when unsure".
 *
 * So we only halt when the failure is unrecoverable: authentication/permission
 * rejected, missing required credential, or an error the agent genuinely
 * cannot fix with the tools it has. Everything else lets the loop continue so
 * the planner can pick the next step.
 *
 * Read-only tools are never stop triggers (the model must keep diagnosing).
 */
export const STOP_TOOLS = new Set([
  "run_command",
  "execute_code",
  "write_file",
  "write_files",
  "edit_file",
  "delete_file",
  "sandbox_write_file",
  "sandbox_write_files",
  "create_pull_request",
]);

// Error signatures that mean the agent cannot proceed on its own — stopping is
// correct. Anything else (exit!=0, conflict, cache, timeout, not-found-by-path)
// is recoverable and the loop continues.
const FATAL_ERROR_PATTERNS = [
  "permission denied",
  "authentication failed",
  "invalid credentials",
  "unauthorized",
  "401",
  "403",
  "bad credentials",
  "token.*expired",
  "missing.*identity",
  "could not authenticate",
];

export function isFatalFailure(message: string): boolean {
  const lower = message.toLowerCase();
  return FATAL_ERROR_PATTERNS.some((p) => {
    if (p.includes(".*")) {
      try {
        return new RegExp(p, "i").test(message);
      } catch {
        return lower.includes(p.replace(/\.\*/, ""));
      }
    }
    return lower.includes(p);
  });
}

// `any` is load-bearing: StopCondition<TOOLS> is invariant in TOOLS, and
// streamText infers a concrete tool set per call. Naming any real ToolSet here
// makes the `stopWhen` array unassignable. The SDK's own helpers are typed the
// same way — `declare function stepCountIs(n: number): StopCondition<any>`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const stopOnToolFailure: StopCondition<any> = ({ steps }) => {
  for (const step of steps) {
    for (const tr of step.toolResults ?? []) {
      const toolName =
        (tr as { toolName?: string }).toolName ?? "";
      if (!STOP_TOOLS.has(toolName)) continue;
      const output = (tr as { output?: unknown }).output;
      if (
        !output ||
        typeof output !== "object" ||
        (output as { success?: unknown }).success !== false
      ) {
        continue;
      }
      // success:false — is it FATAL or recoverable?
      const errMsg =
        (output as { error?: string }).error ??
        (output as { stderr?: string }).stderr ??
        "";
      if (isFatalFailure(errMsg)) {
        return true; // halt: auth/permission/unrecoverable
      }
      // recoverable/ambiguous: let the loop continue so the planner re-plans.
    }
  }
  return false;
};

/**
 * Infer the task type when the agent didn't call report_state (LLMs often
 * skip it on busy turns). Priority: explicit report_state → userText keyword
 * → tool-usage heuristic → 'general'. This keeps Quick Actions context-aware
 * without depending on the model's discipline.
 */
export function inferTaskType(
  reported: string | undefined,
  usedTools: Set<string>,
  userText: string,
): string {
  if (reported && reported.trim()) return reported.toLowerCase();
  const text = (userText ?? "").toLowerCase();
  if (/\baudit\b|review kode|tinjau|periksa/.test(text)) return "audit";
  if (/\bdebug\b|bug|error|fix|perbaik/.test(text)) return "debugging";
  if (/\bui\b|tampilan|layout|responsive|dark mode|css|style/.test(text)) return "ui";
  if (/\bdeploy\b|production|publish|release/.test(text)) return "deploy";
  if (/\bmerge\b|push|pull request|pr\b/.test(text)) return "git";
  if (/\brefactor\b|restructure|cleanup/.test(text)) return "refactor";
  if (/\btest\b|testing|regression/.test(text)) return "test";
  if (/\bdocs\b|documentation|readme/.test(text)) return "docs";
  // Tool-usage heuristic.
  if (usedTools.has("create_pull_request")) return "git";
  if (usedTools.has("run_command") && usedTools.has("write_file")) return "debugging";
  if (usedTools.has("write_file") || usedTools.has("write_files") || usedTools.has("edit_file")) return "feature";
  if (usedTools.has("run_command") || usedTools.has("execute_code")) return "debugging";
  return "general";
}

/**
 * Derive the final AgentCompletionState from the completed stream's steps +
 * finishReason. This is the SINGLE source of truth for the UI's Quick Actions.
 *
 * LLM semantic input (taskType/objective/summary) is read from the
 * report_state tool result if present. Execution status, nextCapabilities,
 * and requiresUserDecision are DERIVED from the actual tool results + finish
 * reason — never from LLM claims.
 *
 * Called once in pipeAttemptToWriter after the reader is done, where
 * result.steps/result.finishReason are final and the writer is in scope.
 */
export function deriveAgentState(
  steps: Array<{ toolResults?: unknown[] }>,
  finishReason: string | undefined,
  modelId: string,
  userText: string,
  toolCount: number,
): AgentCompletionState | null {
  try {
    type ToolResultLike = {
      toolName?: string;
      output?: {
        success?: unknown;
        error?: string;
        taskType?: string;
        objective?: string;
        summary?: string;
        suggestedActions?: string[];
      };
    };
    const allResults = steps.flatMap(
      (s) => (s.toolResults ?? []) as ToolResultLike[],
    );
    const report = allResults.find((tr) => tr.toolName === "report_state");
    const reportOut = report?.output;
    log.debug("derived from steps", {
      hasReportState: !!report,
      reportedTaskType: reportOut?.taskType,
      toolNames: allResults.map((tr) => tr.toolName),
      finishReason,
      stepCount: steps.length,
    });
    const mutatingResults = allResults.filter((tr) =>
      STOP_TOOLS.has(tr.toolName ?? ""),
    );
    const anyMutatingFailed = mutatingResults.some(
      (tr) => tr.output && tr.output.success === false,
    );
    const anyFatal = mutatingResults.some((tr) => {
      const o = tr.output;
      if (!o || o.success !== false) return false;
      return isFatalFailure(o.error ?? "");
    });

    let status: AgentCompletionState["status"] = "completed";
    if (anyFatal) status = "failed";
    else if (anyMutatingFailed) status = "completed"; // recoverable, turn ended
    if (finishReason === "length") status = "running";
    if (finishReason === "error") status = "failed";

    const usedToolNames = new Set(
      allResults.map((tr) => tr.toolName ?? ""),
    );
    // taskType: prefer the LLM's report_state. If the agent didn't call it
    // (LLMs often skip it on busy turns), infer from tool usage + userText so
    // Quick Actions stay context-aware without relying on the model's discipline.
    const taskType = inferTaskType(reportOut?.taskType, usedToolNames, userText);
    const nextCapabilities: string[] = [];
    if (taskType === "audit") nextCapabilities.push("fix", "security", "performance", "testing");
    else if (taskType === "ui") nextCapabilities.push("responsive", "spacing", "darkmode", "typography");
    else if (taskType === "debugging") nextCapabilities.push("fix", "testing", "rootCause", "logging");
    else if (taskType === "git") nextCapabilities.push("merge", "deploy", "review");
    else if (taskType === "deploy") nextCapabilities.push("verify", "logs", "smoke");
    if (
      usedToolNames.has("write_file") ||
      usedToolNames.has("write_files") ||
      usedToolNames.has("edit_file")
    ) {
      if (!nextCapabilities.includes("merge")) nextCapabilities.push("merge");
    }

    // Planner-provided next steps (from report_state.suggestedActions) are
    // the highest-quality follow-ups — they mirror what the agent actually
    // offered. resolveActions prioritizes these above text extraction.
    const suggestedActions =
      Array.isArray(reportOut?.suggestedActions) &&
      reportOut!.suggestedActions!.length > 0
        ? reportOut!.suggestedActions!.slice(0, 3)
        : undefined;

    return {
      taskType,
      objective: reportOut?.objective ?? userText.slice(0, 120),
      summary: reportOut?.summary ?? "",
      status,
      nextCapabilities,
      suggestedActions,
      requiresUserDecision: status === "failed" && anyFatal,
      metadata: {
        finishReason,
        toolCount,
        modelId,
      },
    };
  } catch (err) {
    log.warn("derive failed", { err });
    return null;
  }
}
