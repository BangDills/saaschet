"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { buildTimeline } from "./build-timeline";
import { computeSummaryStats, formatElapsed } from "./summary-stats";
import { ActivityGroup } from "./ActivityGroup";
import { SummaryCard } from "./SummaryCard";
import type { ToolCallPart } from "../tool-call";

/**
 * Top-level activity timeline. Renders semantic activities (via
 * buildTimeline) grouped by intention, with a workflow-aware layout.
 * Live streaming: groups update as parts stream in, auto-collapse on done.
 */
export function ActivityTimeline({
  parts,
  streaming,
  durationMs,
  taskType,
  onActionPrompt,
}: {
  parts: ToolCallPart[];
  streaming: boolean;
  /** Persisted turn duration (from message metadata) — survives reload. */
  durationMs?: number;
  /** AgentState taskType (from message metadata) — selects the workflow preset. */
  taskType?: string;
  onActionPrompt?: (text: string) => void;
}) {
  const data = React.useMemo(
    () => buildTimeline(parts, { taskType }),
    [parts, taskType],
  );

  // Elapsed time for header + summary — the turn duration measured by the
  // server and delivered via message metadata (survives reload).
  const elapsedMs = !streaming && durationMs != null ? durationMs : null;

  const stats = React.useMemo(
    () => computeSummaryStats(data.groups, elapsedMs),
    [data.groups, elapsedMs],
  );

  if (data.totalActions === 0 && !streaming) return null;

  return (
    <div className="my-3">
      {/* Header: Working / Completed in 18s */}
      <div className="flex items-center gap-2 py-1 text-sm">
        {streaming ? (
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none text-muted-foreground" aria-hidden="true" />
        ) : null}
        <span className="font-medium text-foreground">
          {streaming
            ? "Working"
            : elapsedMs != null
              ? `Completed in ${formatElapsed(elapsedMs)}`
              : "Completed"}
        </span>
      </div>

      {/* Groups */}
      <div className="ml-1">
        {data.groups.map((group) => (
          <ActivityGroup
            key={group.id}
            group={group}
            streaming={streaming}
            onActionPrompt={onActionPrompt}
          />
        ))}
      </div>

      {/* Summary card — only when done + has actions */}
      {!streaming && data.totalActions > 0 && <SummaryCard stats={stats} />}
    </div>
  );
}
