"use client";

import { Check } from "lucide-react";
import type { SummaryStats } from "./activity-types";

/**
 * Final summary card — auto-appended when agent finishes.
 * Shows counts per category + elapsed time (live turn only).
 * Reloaded turns omit elapsed (no fabricated duration).
 */
export function SummaryCard({ stats }: { stats: SummaryStats }) {
  if (stats.lines.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <span className="flex size-5 items-center justify-center rounded-full bg-emerald-600/10 text-emerald-600">
          <Check className="size-3.5" aria-hidden="true" />
        </span>
        <span className="text-sm font-medium text-foreground">Completed</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {stats.lines.map((line, i) => (
          <span key={i} className="text-xs text-muted-foreground">
            ✓ {line}
          </span>
        ))}
      </div>
      {stats.elapsedLabel && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Completed in {stats.elapsedLabel}
        </p>
      )}
    </div>
  );
}
