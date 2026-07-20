import type { ActivityGroupData, SummaryStats } from "./activity-types";

const CATEGORY_VERBS: Record<string, (n: number) => string> = {
  explore: (n) => `Explored ${n} ${n === 1 ? "folder" : "folders"}`,
  read: (n) => `Read ${n} ${n === 1 ? "file" : "files"}`,
  search: (n) => `Searched ${n}×`,
  commands: (n) => `Ran ${n} ${n === 1 ? "command" : "commands"}`,
  code: (n) => `Executed ${n} ${n === 1 ? "script" : "scripts"}`,
  created: (n) => `Created ${n} ${n === 1 ? "file" : "files"}`,
  updated: (n) => `Updated ${n} ${n === 1 ? "file" : "files"}`,
  deleted: (n) => `Deleted ${n} ${n === 1 ? "file" : "files"}`,
  other: (n) => `${n} ${n === 1 ? "action" : "actions"}`,
};

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 1) return "<1s";
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec}s`;
}

/**
 * Compute summary card stats from groups + optional elapsed time.
 * Elapsed is null for reloaded turns (no fabricated duration).
 */
export function computeSummaryStats(
  groups: ActivityGroupData[],
  elapsedMs: number | null,
): SummaryStats {
  const lines: string[] = [];
  for (const g of groups) {
    const verb = CATEGORY_VERBS[g.id];
    if (verb) lines.push(verb(g.count));
  }
  return {
    lines,
    elapsedLabel: elapsedMs != null ? formatElapsed(elapsedMs) : null,
  };
}
