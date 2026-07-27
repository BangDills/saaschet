import type { ActivityCategory, FileOp } from "./activity-types";

/** Map tool name → intention category, with optional input context for commands. */
export function classifyToolName(
  toolName: string,
  input?: unknown,
): ActivityCategory {
  switch (toolName) {
    case "list_files":
    case "sandbox_list_files":
      return "exploring";
    case "read_file":
    case "sandbox_read_file":
    case "context7_get_docs":
      return "analyzing";
    case "serena_call_tool":
      return "analyzing";
    case "search_code":
    case "web_search":
    case "context7_search_library":
    case "serena_list_tools":
      return "searching";
    case "run_command":
      return classifyCommand(input);
    case "execute_code":
      return "executing";
    case "write_file":
    case "write_files":
    case "sandbox_write_file":
    case "sandbox_write_files":
      return "creating"; // optimistic; classifyFileOp may flip to "updating"
    case "edit_file":
      return "updating";
    case "delete_file":
      return "deleting";
    case "create_pull_request":
      return "applying";
    case "report_state":
      return "planning";
    default:
      return "planning";
  }
}

/**
 * Classify a shell command as validating (test/lint/build/check) or executing.
 */
function classifyCommand(input: unknown): ActivityCategory {
  const cmd = extractCommand(input);
  if (!cmd) return "executing";
  const lower = cmd.toLowerCase();
  if (
    /^(npm test|npm run test|pnpm test|yarn test)/.test(lower) ||
    /^vitest\b/.test(lower) ||
    /^jest\b/.test(lower) ||
    /\s--(test|check|lint|format)/.test(lower) ||
    /^(npm run lint|npm run build|pnpm run lint|pnpm run build)/.test(lower)
  ) {
    return "validating";
  }
  // git status/checkout/switch/log are informative, not task execution
  if (/^git (status|log|diff|show)/.test(lower)) {
    return "analyzing";
  }
  if (cmd.length < 50) {
    // Short informational commands
    if (/^(cat|less|head|tail|wc|du|df|which|type)/.test(lower)) {
      return "analyzing";
    }
    if (/^(npm ls|npm list|pnpm ls|pip list)/.test(lower)) {
      return "analyzing";
    }
  }
  return "executing";
}

function extractCommand(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  if (typeof obj.command === "string" && obj.command) return obj.command;
  if (typeof obj.script === "string" && obj.script) return obj.script;
  return null;
}

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

/** Human-readable group label per intention category. */
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
