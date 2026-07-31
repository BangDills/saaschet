/**
 * Context-aware follow-up actions for the AI agent.
 *
 * The agent reports a structured AgentCompletionState (task type, status,
 * objective, what it can do next). The UI never hardcodes buttons — it reads
 * the resolved actions from that state.
 *
 * Suggestions come from three places, in order: the planner's own
 * `suggestedActions` (report_state), the generated `followUps` produced from
 * the finished turn (see lib/chat/turn/follow-ups.ts), and finally a small
 * registry keyed by taskType × status. When none of those has anything, the
 * answer is an empty list and the UI shows nothing — a suggestion the user
 * cannot act on is worse than no suggestion.
 */

/** A suggestion the user can tap under a reply. */
export type FollowUp = {
  /** Short chip text — the action itself, not a description of it. */
  label: string;
  /**
   * What gets sent as the user's next message on tap. Self-contained: the
   * assistant never sees the label, so a terse label like "Perbaiki bug" would
   * otherwise arrive stripped of the context that made it meaningful.
   */
  message: string;
};

/** A resolved action, ready to render. */
export type AgentAction = FollowUp & {
  /** Stable id for the React key. */
  id: string;
  /** Optional capability this action maps to, for filtering by nextCapabilities. */
  capability?: string;
};

/** A registry row. Its label doubles as its message — these are self-explanatory. */
type RegistryAction = {
  id: string;
  label: string;
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
  /** Explicit labels the planner wants shown (report_state.suggestedActions). */
  suggestedActions?: string[];
  /** Generated suggestions, each carrying its own send-on-tap message. */
  followUps?: FollowUp[];
  requiresUserDecision?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Registry keyed by taskType → status → list of candidate actions.
 * Last-resort scaffolding only: reached when neither the planner nor the
 * generator produced anything. Keep labels short and action-oriented.
 */
export const ActionRegistry: Record<
  string,
  Partial<Record<AgentCompletionState["status"], RegistryAction[]>>
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

/** Follow-ups are a nudge, not a menu. */
const MAX_ACTIONS = 4;

function fromRegistry(actions: RegistryAction[]): AgentAction[] {
  return actions.slice(0, MAX_ACTIONS).map((action) => ({
    ...action,
    message: action.label,
  }));
}

/**
 * Resolve the follow-up actions for a given agent state.
 *
 * Priority:
 *  1. `suggestedActions` — the planner said, in its own words, what it offered.
 *     Labels only, so the label doubles as the message.
 *  2. `followUps` — generated from the finished turn, each with its own
 *     self-contained message.
 *  3. ActionRegistry[taskType][status], filtered by `nextCapabilities` when
 *     that narrowing leaves anything.
 *  4. Nothing. Render no chips.
 */
export function resolveActions(state: AgentCompletionState | null | undefined): AgentAction[] {
  if (!state) return [];

  // 1. Planner-provided labels win — it knows what it actually offered.
  if (Array.isArray(state.suggestedActions) && state.suggestedActions.length > 0) {
    const fromPlanner = state.suggestedActions
      .filter((label): label is string => typeof label === "string" && label.trim().length > 0)
      .slice(0, MAX_ACTIONS)
      .map((label, i) => ({
        id: `planner-${i}`,
        label: label.trim(),
        message: label.trim(),
      }));
    if (fromPlanner.length > 0) return fromPlanner;
  }

  // 2. Generated suggestions, grounded in what the reply actually said.
  if (Array.isArray(state.followUps) && state.followUps.length > 0) {
    const generated = state.followUps
      .filter((f) => f && typeof f.label === "string" && f.label.trim().length > 0)
      .slice(0, MAX_ACTIONS)
      .map((f, i) => ({
        id: `followup-${i}`,
        label: f.label.trim(),
        message:
          typeof f.message === "string" && f.message.trim().length > 0
            ? f.message.trim()
            : f.label.trim(),
      }));
    if (generated.length > 0) return generated;
  }

  // 3. Registry lookup by taskType + status.
  const statusActions = ActionRegistry[state.taskType]?.[state.status];
  if (statusActions && statusActions.length > 0) {
    const caps = state.nextCapabilities;
    if (caps && caps.length > 0) {
      const filtered = statusActions.filter(
        (a) => !a.capability || caps.includes(a.capability),
      );
      if (filtered.length > 0) return fromRegistry(filtered);
    }
    return fromRegistry(statusActions);
  }

  // 4. Nothing trustworthy to offer.
  return [];
}
