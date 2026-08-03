/**
 * Turn execution mode — Plan vs Execute, and Execute's auto vs ask-first.
 *
 * Sent from the composer as `body.mode` on /api/chat and persisted per
 * conversation. The mode changes agent behavior on the server, not just the
 * prompt:
 *
 *  - **plan**: the agent only gets READ tools (the same `readTools` branch used
 *    when no GitHub token is present) plus a planning instruction, so it is
 *    physically unable to write — not merely asked not to. No sandbox starts.
 *  - **execute/auto**: full read+write tool set, no confirmation.
 *  - **execute/ask**: full tool set, but every write tool gets
 *    `needsApproval: true` so the SDK emits an approval request and never runs
 *    the tool's `execute` until the user approves in the UI.
 */
export type AgentPhaseMode = "plan" | "execute";
export type ExecApprovalMode = "auto" | "ask";

export type TurnMode = {
  phase: AgentPhaseMode;
  exec: ExecApprovalMode;
};

/** Default when a conversation has no stored mode: execute + auto (unchanged behavior). */
export const DEFAULT_TURN_MODE: TurnMode = { phase: "execute", exec: "auto" };

/** Tool names that mutate state and therefore need approval in "ask" mode. */
export const WRITE_TOOL_NAMES = new Set([
  // GitHub write tools (operate on the work branch)
  "write_file",
  "write_files",
  "edit_file",
  "delete_file",
  "create_pull_request",
  // Sandbox execution + write tools
  "run_command",
  "execute_code",
  "sandbox_write_file",
  "sandbox_write_files",
]);

/** Parse an untrusted /api/chat body.mode into a TurnMode, falling back to default. */
export function parseTurnMode(raw: unknown): TurnMode {
  if (!raw || typeof raw !== "object") return DEFAULT_TURN_MODE;
  const o = raw as Record<string, unknown>;
  const phase: AgentPhaseMode = o.phase === "plan" ? "plan" : "execute";
  const exec: ExecApprovalMode = o.exec === "ask" ? "ask" : "auto";
  return { phase, exec };
}

/**
 * Ask-first gate. Wraps every write tool in the set with `needsApproval: true`
 * so the AI SDK emits an approval request and never runs the tool's `execute`
 * until the user approves in the UI (addToolApprovalResponse). Read tools pass
 * through untouched. Tools whose definition is a plain object (not created by
 * `tool()`) are left alone — we only gate the ones we can safely re-wrap.
 */
export function gateWriteToolsForApproval<T extends Record<string, unknown>>(
  tools: T,
  exec: ExecApprovalMode,
): T {
  if (exec !== "ask") return tools;
  const out: Record<string, unknown> = {};
  for (const [name, def] of Object.entries(tools)) {
    if (WRITE_TOOL_NAMES.has(name) && def && typeof def === "object") {
      out[name] = { ...(def as object), needsApproval: true };
    } else {
      out[name] = def;
    }
  }
  return out as T;
}
