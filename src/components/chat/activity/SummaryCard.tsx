"use client";

import { Clock } from "lucide-react";
import type { SummaryStats } from "./activity-types";

export function SummaryCard({ stats }: { stats: SummaryStats }) {
  if (stats.lines.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        {stats.elapsedLabel && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3.5" aria-hidden="true" />
            Completed in {stats.elapsedLabel}
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {stats.lines.map((line, i) => (
          <span key={i} className="text-xs text-muted-foreground">
            {line}
          </span>
        ))}
      </div>
    </div>
  );
}
