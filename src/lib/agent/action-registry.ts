/**
 * Context-aware Quick Actions for the AI agent.
 *
 * The agent reports a structured AgentCompletionState (task type, status,
 * objective, what it can do next). The UI never hardcodes buttons — it looks
 * up actions in the ActionRegistry by (taskType, status), optionally filters
 * by the capabilities the agent said it has, and renders 3–5 relevant ones.
 *
 * Adding a new task category = add one entry to ActionRegistry. No UI change.
 */

/** A single suggested action shown as a button in the chat follow-up row. */
export type AgentAction = {
  /** Stable id; the client sends this back as the next user message intent. */
  id: string;
  /** Button label (Indonesian, user-facing). */
  label: string;
  /** Optional capability this action maps to, for filtering by nextCapabilities. */
  capability?: string;
};

/**
 * Structured state the agent (planner/orchestrator) emits at end of turn.
 * This is the single source of truth for the follow-up actions UI.
 */
export interface AgentCompletionState {
  taskType: string;
  status:
    | "planning"
    | "running"
    | "completed"
    | "blocked"
    | "approval_required"
    | "failed";
  objective: string;
  summary: string;
  /** Capability ids the agent can act on next (e.g. "fix", "security"). */
  nextCapabilities?: string[];
  /** Explicit actions the planner wants shown (overrides registry). */
  suggestedActions?: string[];
  requiresUserDecision?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Registry keyed by taskType → status → list of candidate actions.
 * Keep labels short and action-oriented.
 */
export const ActionRegistry: Record<
  string,
  Partial<Record<AgentCompletionState["status"], AgentAction[]>>
> = {
  audit: {
    completed: [
      { id: "fix", label: "Perbaiki seluruh temuan audit", capability: "fix" },
      { id: "security", label: "Audit keamanan lebih lanjut", capability: "security" },
      { id: "performance", label: "Audit performa", capability: "performance" },
      { id: "testing", label: "Buat regression test", capability: "testing" },
    ],
    failed: [
      { id: "retry", label: "Coba ulang audit", capability: "fix" },
      { id: "narrow", label: "Audit bagian spesifik", capability: "fix" },
    ],
  },
  ui: {
    completed: [
      { id: "responsive", label: "Optimalkan tampilan mobile", capability: "responsive" },
      { id: "spacing", label: "Rapikan spacing", capability: "spacing" },
      { id: "darkmode", label: "Perbaiki dark mode", capability: "darkmode" },
      { id: "typography", label: "Rapikan typography", capability: "typography" },
    ],
  },
  debugging: {
    completed: [
      { id: "fixBug", label: "Perbaiki bug", capability: "fix" },
      { id: "regression", label: "Buat regression test", capability: "testing" },
      { id: "rootCause", label: "Cari akar penyebab", capability: "rootCause" },
      { id: "logging", label: "Tambahkan logging", capability: "logging" },
    ],
  },
  git: {
    completed: [
      { id: "merge", label: "Merge ke main", capability: "merge" },
      { id: "deploy", label: "Deploy", capability: "deploy" },
      { id: "review", label: "Review perubahan", capability: "review" },
    ],
  },
  deploy: {
    completed: [
      { id: "verifyProd", label: "Verifikasi production", capability: "verify" },
      { id: "logs", label: "Lihat deployment log", capability: "logs" },
      { id: "smoke", label: "Jalankan smoke test", capability: "smoke" },
    ],
  },
};

/** Generic fallback when no taskType / no registry entry / no capabilities. */
const GENERIC_ACTIONS: AgentAction[] = [
  { id: "explain", label: "Jelaskan lebih detail" },
  { id: "next", label: "Apa langkah berikutnya?" },
  { id: "example", label: "Berikan contoh" },
];

/**
 * Resolve the follow-up actions for a given agent state.
 *
 * Priority:
 *  1. If the planner sent `suggestedActions`, use them (mapped to labels as-is).
 *  2. Else look up ActionRegistry[taskType][status]; if `nextCapabilities` is
 *     present, filter to actions whose `capability` is in that set; if that
 *     yields nothing, fall back to the unfiltered registry list.
 *  3. Else (unknown taskType / empty registry) use GENERIC_ACTIONS.
 *
 * Always returns 3–5 actions (trimmed/padded sensibly).
 */
export function resolveActions(state: AgentCompletionState | null | undefined): AgentAction[] {
  if (!state) return GENERIC_ACTIONS.slice(0, 4);

  // 1. Planner-provided explicit actions win.
  if (Array.isArray(state.suggestedActions) && state.suggestedActions.length > 0) {
    const fromPlanner = state.suggestedActions.slice(0, 5).map((label, i) => ({
      id: `planner-${i}`,
      label,
    }));
    return fromPlanner;
  }

  // 2. Registry lookup by taskType + status.
  const statusActions = ActionRegistry[state.taskType]?.[state.status];
  if (statusActions && statusActions.length > 0) {
    const caps = state.nextCapabilities;
    if (caps && caps.length > 0) {
      const filtered = statusActions.filter(
        (a) => !a.capability || caps.includes(a.capability),
      );
      if (filtered.length > 0) return filtered.slice(0, 5);
    }
    return statusActions.slice(0, 5);
  }

  // 3. Fallback.
  return GENERIC_ACTIONS.slice(0, 4);
}
