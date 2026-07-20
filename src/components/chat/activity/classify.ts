import type { ActivityCategory, FileOp } from "./activity-types";

/** Map tool name → activity category for grouping. */
export function classifyToolName(toolName: string): ActivityCategory {
  switch (toolName) {
    case "list_files":
    case "sandbox_list_files":
      return "explore";
    case "read_file":
    case "sandbox_read_file":
    case "context7_get_docs":
      return "read";
    case "serena_call_tool":
      return "read"; // semantic code tool — read-ish
    case "search_code":
    case "web_search":
    case "context7_search_library":
    case "serena_list_tools":
      return "search";
    case "run_command":
      return "commands";
    case "execute_code":
      return "code";
    case "write_file":
    case "write_files":
    case "sandbox_write_file":
    case "sandbox_write_files":
      return "created"; // optimistic; classifyFileOp may flip to "updated"
    case "edit_file":
      return "updated";
    case "delete_file":
      return "deleted";
    case "create_pull_request":
    case "report_state":
      return "other";
    default:
      return "other";
  }
}

/**
 * Classify a file operation as created / updated / deleted.
 * - delete_file → "deleted"
 * - edit_file → "updated" (edit implies file exists)
 * - write_file/write_files/sandbox_* → "created" if first write to path with
 *   lines_deleted === 0, else "updated". Uses a seen-paths Set threaded by
 *   the caller to track duplicates within a turn.
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
    // Check output for lines_deleted > 0 (indicates overwrite of existing).
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

/** Human-readable group label per category. */
export const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  explore: "Explore project",
  read: "Read files",
  search: "Search codebase",
  commands: "Run commands",
  code: "Executed code",
  created: "Created files",
  updated: "Updated files",
  deleted: "Deleted files",
  other: "Other actions",
};

/** Canonical ordering for groups in the timeline. */
export const CATEGORY_ORDER: ActivityCategory[] = [
  "explore",
  "read",
  "search",
  "commands",
  "code",
  "created",
  "updated",
  "deleted",
  "other",
];
