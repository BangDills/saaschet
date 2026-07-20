"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { buildTimeline } from "./build-timeline";
import { computeSummaryStats } from "./summary-stats";
import { ActivityGroup } from "./ActivityGroup";
import { SummaryCard } from "./SummaryCard";
import type { ToolCallPart } from "../tool-call";

/**
 * Top-level activity timeline — replaces the old single ActivityGroup.
 * Calls buildTimeline(parts) → grouped data, renders groups + SummaryCard.
 * Live streaming: groups update as parts stream in, auto-collapse on done.
 */
export function ActivityTimeline({
  parts,
  streaming,
  startedAt,
  onActionPrompt,
}: {
  parts: ToolCallPart[];
  streaming: boolean;
  startedAt?: number;
  onActionPrompt?: (text: string) => void;
}) {
  const data = React.useMemo(() => buildTimeline(parts), [parts]);

  // Compute elapsed for summary card (live turn only).
  const elapsedMs = React.useMemo(() => {
    if (streaming || !startedAt) return null;
    return Date.now() - startedAt;
  }, [streaming, startedAt]);

  const stats = React.useMemo(
    () => computeSummaryStats(data.groups, elapsedMs),
    [data.groups, elapsedMs],
  );

  if (data.totalActions === 0 && !streaming) return null;

  return (
    <div className="my-3">
      {/* Header: Working / Completed · N actions */}
      <div className="flex items-center gap-2 py-1 text-sm">
        {streaming ? (
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none text-muted-foreground" aria-hidden="true" />
        ) : null}
        <span className="font-medium text-foreground">
          {streaming ? "Working" : "Completed"}
        </span>
        {data.totalActions > 0 && (
          <span className="text-muted-foreground">
            · {data.totalActions} {data.totalActions === 1 ? "action" : "actions"}
          </span>
        )}
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
