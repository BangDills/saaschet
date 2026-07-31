/**
 * Context-aware follow-up actions for the AI agent.
 *
 * The agent reports a structured AgentCompletionState (task type, status,
 * objective, what it can do next). The UI never hardcodes buttons — it reads
 * the resolved actions from that state.
 *
 * Suggestions come from two places, in order: the planner's own
 * `suggestedActions` (report_state) and the generated `followUps` produced
 * from the finished turn (see lib/chat/turn/follow-ups.ts). When neither has
 * anything, the answer is an empty list and the UI shows nothing.
 *
 * There used to be a third tier: a table of canned labels keyed by
 * taskType × status. It shipped exactly the failure this module is supposed to
 * prevent — a turn about image-generation features, whose taskType had been
 * INFERRED as "audit" from the user's wording, was offered "Perbaiki seluruh
 * temuan audit" and "Audit performa". Confidently wrong and topically
 * unrelated, which is worse than the generic labels it replaced. A suggestion
 * the user cannot act on is worse than no suggestion, so the tier is gone.
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

/** Follow-ups are a nudge, not a menu. */
const MAX_ACTIONS = 4;

/**
 * Resolve the follow-up actions for a given agent state.
 *
 * Priority:
 *  1. `suggestedActions` — the planner said, in its own words, what it offered.
 *     Labels only, so the label doubles as the message.
 *  2. `followUps` — generated from the finished turn, each with its own
 *     self-contained message.
 *  3. Nothing. Render no chips.
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

  // 3. Nothing trustworthy to offer.
  return [];
}
