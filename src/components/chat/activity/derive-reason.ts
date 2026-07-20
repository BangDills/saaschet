import { redactVendorPath } from "@/lib/url";
import type { ActivityCategory } from "./activity-types";

/** Get the basename of a path (last segment), redacted. */
function shortPath(path: unknown): string {
  if (typeof path !== "string" || !path) return "";
  const redacted = redactVendorPath(path);
  const parts = redacted.split("/");
  return parts[parts.length - 1] || redacted;
}

/** Count files in a write_files input. */
function countFiles(files: unknown): number {
  return Array.isArray(files) ? files.length : 0;
}

/** First word of a shell command. */
function firstCmdWord(command: unknown): string {
  if (typeof command !== "string") return "command";
  return command.trim().split(/\s+/)[0] || "command";
}

/** Per-tool reason generator — one short sentence, no LLM. */
const REASON_BY_TOOL: Record<string, (input: Record<string, unknown>) => string> = {
  list_files: (i) => `Explore ${shortPath(i.path) || "project structure"}`,
  sandbox_list_files: (i) => `Explore ${shortPath(i.path) || "sandbox files"}`,
  read_file: (i) => `Read ${shortPath(i.path) || "file"}`,
  sandbox_read_file: (i) => `Read ${shortPath(i.path) || "sandbox file"}`,
  search_code: (i) => `Search codebase for "${typeof i.query === "string" ? i.query : ""}"`,
  web_search: (i) => `Search the web for "${typeof i.query === "string" ? i.query : ""}"`,
  context7_search_library: (i) => `Look up docs for ${typeof i.libraryName === "string" ? i.libraryName : "library"}`,
  context7_get_docs: (i) => `Read ${typeof i.libraryId === "string" ? i.libraryId : "library"} documentation`,
  run_command: (i) => `Run ${firstCmdWord(i.command)}`,
  execute_code: () => `Execute code snippet`,
  write_file: (i) => `Create ${shortPath(i.path) || "file"}`,
  sandbox_write_file: (i) => `Create ${shortPath(i.path) || "file"}`,
  write_files: (i) => `Create ${countFiles(i.files)} file(s)`,
  sandbox_write_files: (i) => `Create ${countFiles(i.files)} file(s)`,
  edit_file: (i) => `Update ${shortPath(i.path) || "file"}`,
  delete_file: (i) => `Delete ${shortPath(i.path) || "file"}`,
  create_pull_request: (i) => `Open pull request "${typeof i.title === "string" ? i.title : ""}"`,
  serena_list_tools: () => `List Serena tools`,
  serena_call_tool: (i) => `Call Serena ${typeof i.toolName === "string" ? i.toolName : "tool"}`,
  report_state: () => `Report task state`,
};

const CATEGORY_FALLBACK: Record<ActivityCategory, string> = {
  explore: "Explore project structure",
  read: "Read source files",
  search: "Search for context",
  commands: "Run commands",
  code: "Execute code",
  created: "Create files",
  updated: "Update files",
  deleted: "Delete files",
  other: "Perform action",
};

/**
 * Derive a one-sentence reason for an activity item — heuristic, no LLM.
 * Uses the per-tool map, falls back to category-level, then generic.
 */
export function deriveReason(
  toolName: string,
  input: unknown,
  category: ActivityCategory,
): string {
  const gen = REASON_BY_TOOL[toolName];
  if (gen) {
    try {
      const obj = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
      return gen(obj);
    } catch {
      // fall through to category fallback
    }
  }
  return CATEGORY_FALLBACK[category] ?? "Perform action";
}
