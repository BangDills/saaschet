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

export function computeSummaryStats(
  groups: ActivityGroupData[],
  elapsedMs: number | null,
): SummaryStats {
  const lines: string[] = [];
  let needsAttention = 0;
  for (const g of groups) {
    const verb = CATEGORY_VERBS[g.id];
    if (verb) lines.push(verb(g.count));
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
