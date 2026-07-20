import type { ToolCallPart } from "../tool-call";

/** Activity grouping category — drives the timeline section headers. */
export type ActivityCategory =
  | "explore"   // list_files, sandbox_list_files
  | "read"      // read_file, sandbox_read_file, context7_get_docs, serena_call_tool
  | "search"    // search_code, web_search, context7_search_library, serena_list_tools
  | "commands"  // run_command
  | "code"      // execute_code
  | "created"   // write_file/write_files/sandbox_write_file/sandbox_write_files (new)
  | "updated"   // edit_file, write_file where file existed
  | "deleted"   // delete_file
  | "other";    // create_pull_request, unknown tools

/** File operation sub-classification (only for file categories). */
export type FileOp = "created" | "updated" | "deleted";

/** A single activity row inside a group — pre-computed display fields. */
export type ActivityItem = {
  key: string;
  toolName: string;
  category: ActivityCategory;
  fileOp?: FileOp;
  filePath?: string;
  reason: string;
  state: ToolCallPart["state"];
  isRunning: boolean;
  isError: boolean;
  isDone: boolean;
  input: unknown;
  output: unknown;
  errorText?: string;
  inputPreview: string;
  outputSummary: string;
  lineStats?: { added: number; deleted: number };
};

/** A grouped section of the timeline. */
export type ActivityGroupData = {
  id: ActivityCategory;
  label: string;
  iconKey: string;
  items: ActivityItem[];
  count: number;
  status: "running" | "success" | "partial" | "failed";
  failedCount: number;
  runningCount: number;
};

/** The full timeline data — groups + summary. */
export type ActivityTimelineData = {
  groups: ActivityGroupData[];
  totalActions: number;
  anyRunning: boolean;
};

/** Summary card statistics. */
export type SummaryStats = {
  lines: string[];
  elapsedLabel: string | null;
};
