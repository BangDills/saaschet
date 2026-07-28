"use client";

import { AlertTriangle, Clock } from "lucide-react";
import type { SummaryStats } from "./activity-types";

/** Execution report shown after the run finishes. */
export function SummaryCard({ stats }: { stats: SummaryStats }) {
  if (stats.lines.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-xs font-semibold text-foreground">Project Summary</p>
      <ul className="mt-2 space-y-0.5">
        {stats.lines.map((line, i) => (
          <li key={i} className="text-xs text-muted-foreground">
            {line}
          </li>
        ))}
      </ul>
      {stats.needsAttentionLine && (
        <p className="mt-2 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="size-3.5" aria-hidden="true" />
          {stats.needsAttentionLine}
        </p>
      )}
      {stats.elapsedLabel && (
        <p className="mt-2 flex items-center gap-1 border-t border-border pt-2 text-xs text-muted-foreground">
          <Clock className="size-3.5" aria-hidden="true" />
          Completed in {stats.elapsedLabel}
        </p>
      )}
    </div>
  );
}
