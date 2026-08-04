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

/** Repo-write tools that ALWAYS need approval in "ask" mode. */
export const REPO_WRITE_TOOL_NAMES = new Set([
  "write_file",
  "write_files",
  "edit_file",
  "delete_file",
  "create_pull_request",
]);

/** Sandbox execution + write tools — gated only when the command looks risky. */
export const SANDBOX_TOOL_NAMES = new Set([
  "run_command",
  "execute_code",
  "sandbox_write_file",
  "sandbox_write_files",
]);

/** Tool names that mutate state and therefore need approval in "ask" mode. */
export const WRITE_TOOL_NAMES = new Set([
  ...REPO_WRITE_TOOL_NAMES,
  ...SANDBOX_TOOL_NAMES,
]);

/**
 * Shell patterns that mark a sandbox command as risky (mutating). Anything
 * else — ls, cat, git status, npm test, npm run build, grep — is read-only and
 * passes without an approval prompt. This is what stops ask-first mode from
 * interrupting on every harmless `run_command`.
 */
const RISKY_COMMAND_PATTERNS = [
  /\brm\b/, /\bmv\b/, /\bcp\b/, /\bmkdir\b/, /\btouch\b/, /\bchmod\b/, /\bchown\b/,
  /\bgit\s+(push|commit|merge|rebase|reset|checkout|switch|restore|clean|apply|am|tag)\b/,
  /\bnpm\s+(install|i|ci|uninstall|remove|update|publish|link)\b/,
  /\byarn\s+(add|remove|install|publish)\b/, /\bpnpm\s+(add|remove|install|publish)\b/,
  /\bpip\s+install\b/, /\bapt(-get)?\s+(install|remove)\b/,
  />\s*[^|]/, />>/, /\btee\b/, /\bdd\b/, /\bkill\b/, /\bpkill\b/, /\bshutdown\b/, /\breboot\b/,
  /\bwrite_file\b|\bdeploy\b/, /\bcurl\b[^|]*(-X\s*(POST|PUT|PATCH|DELETE)|--data|-d\s)/,
];

/** True when a sandbox command looks like it mutates state (vs read-only). */
export function isRiskyCommand(command: string): boolean {
  return RISKY_COMMAND_PATTERNS.some((re) => re.test(command));
}

/**
 * Per-turn approval memory for ask-first mode (the "C" half): once the user
 * approves a tool of a given name, later calls of the same tool in the same
 * turn are auto-approved instead of prompting again. Repo-write tools are
 * excluded — they always ask, because each one is a distinct irreversible
 * action. Only sandbox commands/tools get the remember-once treatment, and
 * only when the command is risky in the first place.
 */
export function makeApprovalDecider() {
  const approvedSandboxTools = new Set<string>();
  /**
   * Decide, for one tool call, whether it must prompt for approval.
   * `input` is the tool's argument object (used to inspect run_command's text).
   */
  function needsApproval(toolName: string, input: unknown): boolean {
    // Repo writes always ask — never remembered, each is a distinct irreversible action.
    if (REPO_WRITE_TOOL_NAMES.has(toolName)) return true;
    if (!SANDBOX_TOOL_NAMES.has(toolName)) return false;
    // run_command is only gated when the command itself looks risky.
    if (toolName === "run_command") {
      const cmd =
        input && typeof input === "object" && "command" in input
          ? String((input as { command?: unknown }).command ?? "")
          : "";
      if (!isRiskyCommand(cmd)) return false;
    }
    // Remember-once: a previously approved sandbox tool auto-approves (the "C").
    if (approvedSandboxTools.has(toolName)) return false;
    return true;
  }
  /** Record that the user approved a sandbox tool — later calls auto-approve. */
  function recordApproval(toolName: string) {
    if (SANDBOX_TOOL_NAMES.has(toolName) && !REPO_WRITE_TOOL_NAMES.has(toolName)) {
      approvedSandboxTools.add(toolName);
    }
  }
  return { needsApproval, recordApproval };
}

/** Parse an untrusted /api/chat body.mode into a TurnMode, falling back to default. */
export function parseTurnMode(raw: unknown): TurnMode {
  if (!raw || typeof raw !== "object") return DEFAULT_TURN_MODE;
  const o = raw as Record<string, unknown>;
  const phase: AgentPhaseMode = o.phase === "plan" ? "plan" : "execute";
  const exec: ExecApprovalMode = o.exec === "ask" ? "ask" : "auto";
  return { phase, exec };
}

/**
 * Ask-first gate (B + C combined). In "ask" mode each write tool gets a
 * `needsApproval` function instead of a blanket `true`:
 *
 *  - **B (selective):** `run_command` only prompts when the command text looks
 *    risky (push, rm, install, redirect, …). Read-only commands pass silently.
 *  - **C (remember-once):** once the user approves a sandbox tool of a given
 *    name, later calls of the same tool in the same turn auto-approve, so a
 *    4-command sequence prompts once, not four times. Repo-write tools always
 *    prompt — each is a distinct irreversible action.
 *
 * Read tools pass through untouched. Only tools created by `tool()` (plain
 * objects with an `execute`) are gated.
 */
export function gateWriteToolsForApproval<T extends Record<string, unknown>>(
  tools: T,
  exec: ExecApprovalMode,
): T {
  if (exec !== "ask") return tools;
  const decider = makeApprovalDecider();
  const out: Record<string, unknown> = {};
  for (const [name, def] of Object.entries(tools)) {
    if (WRITE_TOOL_NAMES.has(name) && def && typeof def === "object") {
      const original = def as {
        execute?: (input: unknown, opts?: unknown) => unknown;
      };
      out[name] = {
        ...(def as object),
        needsApproval: (input: unknown) => decider.needsApproval(name, input),
        // Wrap execute so a successful run records the approval for
        // remember-once (the "C" half). Only fires after the user approved,
        // because the SDK only runs execute post-approval.
        ...(original.execute
          ? {
              execute: async (input: unknown, opts?: unknown) => {
                decider.recordApproval(name);
                return original.execute!(input, opts);
              },
            }
          : {}),
      };
    } else {
      out[name] = def;
    }
  }
  return out as T;
}
