import type { ActivityCategory, WorkflowId } from "./activity-types";
import { CATEGORY_LABELS } from "./classify";

/**
 * Workflow presets — the timeline adapts its group labels to the kind of
 * work being performed, so a repository review reads "Identifying issues →
 * Generating recommendations" while a bug fix reads "Understanding the
 * issue → Planning the solution → Applying the fix".
 *
 * The workflow is resolved from the orchestrator's AgentState taskType when
 * available (persisted in message metadata), with a conservative heuristic
 * fallback derived from the activity mix.
 */

/** Map the orchestrator taskType (see inferTaskType in the chat route) to a workflow. */
const TASK_TYPE_TO_WORKFLOW: Record<string, WorkflowId> = {
  audit: "review",
  review: "review",
  debugging: "bugfix",
  bugfix: "bugfix",
  feature: "feature",
  ui: "feature",
  refactor: "feature",
};

/** Contextual group-label overrides per workflow (fall back to CATEGORY_LABELS). */
const WORKFLOW_GROUP_LABELS: Record<WorkflowId, Partial<Record<ActivityCategory, string>>> = {
  review: {
    analyzing: "Analyzing source files",
    searching: "Identifying issues",
    executing: "Inspecting project structure",
    planning: "Generating recommendations",
    applying: "Preparing final report",
  },
  bugfix: {
    analyzing: "Understanding the issue",
    searching: "Searching related code",
    planning: "Planning the solution",
    applying: "Applying the fix",
  },
  feature: {
    analyzing: "Understanding existing implementation",
    planning: "Planning the feature",
    creating: "Creating components",
    updating: "Updating components",
  },
  general: {},
};

/**
 * Resolve the workflow for a turn. `taskType` (from AgentState metadata)
 * wins; otherwise a read-only activity mix implies a review. Anything
 * ambiguous stays "general" — a wrong generic label beats a wrong
 * specific one.
 */
export function resolveWorkflow(
  taskType: string | null | undefined,
  categories: ReadonlySet<ActivityCategory>,
): WorkflowId {
  const mapped = taskType ? TASK_TYPE_TO_WORKFLOW[taskType.toLowerCase()] : undefined;
  if (mapped) return mapped;

  const writes =
    categories.has("creating") ||
    categories.has("updating") ||
    categories.has("deleting") ||
    categories.has("applying");
  const reads =
    categories.has("exploring") || categories.has("analyzing") || categories.has("searching");
  if (reads && !writes) return "review";
  return "general";
}

/** Group label for a category under the given workflow. */
export function workflowGroupLabel(workflow: WorkflowId, category: ActivityCategory): string {
  return WORKFLOW_GROUP_LABELS[workflow][category] ?? CATEGORY_LABELS[category];
}
