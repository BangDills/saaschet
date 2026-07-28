import type { ActivityCategory, FileOp } from "./activity-types";

/**
 * Classify a file operation as created / updated / deleted.
 */
export function classifyFileOp(
  toolName: string,
  output: unknown,
  seenPaths: Set<string>,
  filePath: string | null,
): FileOp | undefined {
  if (toolName === "delete_file") return "deleted";
  if (toolName === "edit_file") return "updated";

  if (
    toolName === "write_file" ||
    toolName === "write_files" ||
    toolName === "sandbox_write_file" ||
    toolName === "sandbox_write_files"
  ) {
    if (!filePath) return "created";
    if (seenPaths.has(filePath)) return "updated";
    if (output && typeof output === "object") {
      const o = output as Record<string, unknown>;
      const linesDeleted = typeof o.lines_deleted === "number" ? o.lines_deleted : 0;
      if (linesDeleted > 0) return "updated";
    }
    seenPaths.add(filePath);
    return "created";
  }
  return undefined;
}

/** Human-readable group label per intention category (generic workflow).
 *  Workflow presets in workflow.ts override these per task type. */
export const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  exploring: "Exploring project",
  analyzing: "Analyzing files",
  searching: "Searching codebase",
  planning: "Planning changes",
  updating: "Updating files",
  creating: "Creating files",
  deleting: "Deleting files",
  executing: "Executing tasks",
  validating: "Running validation",
  applying: "Applying changes",
};

/** Canonical ordering for groups in the timeline. */
export const CATEGORY_ORDER: ActivityCategory[] = [
  "exploring",
  "analyzing",
  "searching",
  "planning",
  "executing",
  "validating",
  "creating",
  "updating",
  "deleting",
  "applying",
];
