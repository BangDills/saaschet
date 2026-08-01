import type { ActivityGroupData, SummaryStats } from "./activity-types";

const CATEGORY_VERBS: Record<string, (n: number) => string> = {
  exploring: (n) => `${n} ${n === 1 ? "folder" : "folders"} explored`,
  analyzing: (n) => `${n} ${n === 1 ? "file" : "files"} analyzed`,
  searching: (n) => `${n} codebase ${n === 1 ? "search" : "searches"}`,
  planning: (n) => `${n} execution ${n === 1 ? "plan" : "plans"}`,
  updating: (n) => `${n} ${n === 1 ? "file" : "files"} updated`,
  creating: (n) => `${n} ${n === 1 ? "file" : "files"} created`,
  deleting: (n) => `${n} ${n === 1 ? "file" : "files"} deleted`,
  executing: (n) => `${n} ${n === 1 ? "task" : "tasks"} completed`,
  validating: (n) => `${n} validation ${n === 1 ? "check" : "checks"}`,
  applying: (n) => `${n} ${n === 1 ? "change" : "changes"} applied`,
};

export function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 1) return "<1s";
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec}s`;
}

/**
 * Categories whose verb counts FILES, not tool calls.
 *
 * `group.count` is the number of tool calls, which used to be the same thing:
 * one read_file was one file. Batch tools break that — one read_files covering
 * three files still counts as one call, so the summary read "2 files analyzed"
 * for a turn that had just listed three filenames in the detail view. The same
 * undercount already applied to write_files; read_files only made it visible.
 */
const COUNTS_FILES = new Set(["analyzing", "updating", "creating", "deleting"]);

/** Files touched by a single tool call — batch tools touch several. */
function itemFileCount(input: unknown): number {
  if (!input || typeof input !== "object") return 1;
  const fields = input as Record<string, unknown>;
  // read_files takes paths[]; write_files / sandbox_write_files take files[].
  if (Array.isArray(fields.paths)) return Math.max(1, fields.paths.length);
  if (Array.isArray(fields.files)) return Math.max(1, fields.files.length);
  return 1;
}

export function computeSummaryStats(
  groups: ActivityGroupData[],
  elapsedMs: number | null,
): SummaryStats {
  const lines: string[] = [];
  let needsAttention = 0;
  for (const g of groups) {
    const verb = CATEGORY_VERBS[g.id];
    if (verb) {
      const n = COUNTS_FILES.has(g.id)
        ? g.items.reduce((sum, item) => sum + itemFileCount(item.input), 0)
        : g.count;
      lines.push(verb(n));
    }
    needsAttention += g.needsAttentionCount;
  }
  return {
    lines,
    needsAttentionLine:
      needsAttention > 0
        ? `${needsAttention} ${needsAttention === 1 ? "item needs" : "items need"} attention`
        : null,
    elapsedLabel: elapsedMs != null ? formatElapsed(elapsedMs) : null,
  };
}
