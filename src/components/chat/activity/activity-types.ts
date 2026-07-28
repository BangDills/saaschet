import type { ToolCallPart } from "../tool-call";

/** Intention-based activity category — what the AI is trying to accomplish. */
export type ActivityCategory =
  | "exploring"    // list_files, sandbox_list_files, ls/tree
  | "analyzing"    // read_file, sandbox_read_file, context7_get_docs, cat/git status
  | "searching"    // search_code, web_search, grep/find
  | "planning"     // report_state, git checkout
  | "updating"     // edit_file, write_file where file existed, sed
  | "creating"     // write_file/write_files/sandbox_write_file/sandbox_write_files (new)
  | "deleting"     // delete_file, rm
  | "executing"    // run_command, execute_code
  | "validating"   // run_command with test/lint/build
  | "applying";    // create_pull_request, git commit/push

/**
 * User-outcome status — NOT a shell exit code. A grep that finds nothing or a
 * diff that reports differences still `completed`; only genuine blockers get
 * `needs-attention`, and missing infrastructure (no sandbox, no API key) is
 * `unavailable` rather than a failure of the user's task.
 */
export type ActivityStatus =
  | "running"
  | "completed"
  | "skipped"
  | "unavailable"
  | "needs-attention";

/** High-level workflow the timeline adapts to (from AgentState taskType). */
export type WorkflowId = "review" | "bugfix" | "feature" | "general";

/** File operation sub-classification (only for file categories). */
export type FileOp = "created" | "updated" | "deleted";

/**
 * A single semantic activity — the UI renders these, never raw command logs.
 * `title`/`description` are human copy; the underlying command/tool payload
 * lives only in `technicalDetails` + input/output (behind "Technical Details").
 */
export type ActivityItem = {
  key: string;
  toolName: string;
  category: ActivityCategory;
  fileOp?: FileOp;
  filePath?: string;
  /** Meaningful action, e.g. "Checking Git status" — never a raw command. */
  title: string;
  /** One-sentence description of intent. */
  description: string;
  /** Raw technical detail (command, query, path) — only shown on expand. */
  technicalDetails?: string;
  status: ActivityStatus;
  /** Wall-clock duration reported by the tool, when available. */
  durationMs?: number;
  state: ToolCallPart["state"];
  isRunning: boolean;
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
  status: "running" | "completed" | "needs-attention";
  needsAttentionCount: number;
  runningCount: number;
};

/** The full timeline data — groups + summary. */
export type ActivityTimelineData = {
  groups: ActivityGroupData[];
  workflow: WorkflowId;
  totalActions: number;
  anyRunning: boolean;
  needsAttention: number;
};

/** Summary card statistics — reads like an execution report. */
export type SummaryStats = {
  lines: string[];
  needsAttentionLine: string | null;
  elapsedLabel: string | null;
};
