"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { TOOL_META, FALLBACK_META, DetailSection, ReadFileTruncationNotice } from "../tool-call";
import { ExpandableSection } from "./ExpandableSection";
import type { ActivityItem as ActivityItemType } from "./activity-types";

/**
 * One activity row inside a group.
 * Collapsed: icon + reason + status indicator.
 * Expanded: delegates to existing ToolCall detail drawer (DetailSection +
 * ReadFileTruncationNotice) — no JSON shown in collapsed state.
 */
export function ActivityItem({
  item,
  onActionPrompt,
}: {
  item: ActivityItemType;
  onActionPrompt?: (text: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const meta = TOOL_META[item.toolName] ?? FALLBACK_META;
  const Icon = meta.Icon;

  return (
    <div className="text-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group flex min-h-8 w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
          {item.isRunning ? (
            <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : item.isError ? (
            <XCircle className="size-3.5 text-destructive" aria-hidden="true" />
          ) : (
            <Icon className="size-3.5" aria-hidden="true" />
          )}
        </span>

        <span className="min-w-0 flex-1 truncate text-xs text-foreground">
          {item.reason}
        </span>

        {item.isDone && !item.isError && item.outputSummary && (
          <span className="hidden max-w-28 shrink-0 truncate text-[10px] text-muted-foreground sm:inline">
            {item.outputSummary}
          </span>
        )}

        {item.lineStats && (
          <span className="shrink-0 font-mono text-[10px] font-medium">
            <span className="text-emerald-600">+{item.lineStats.added}</span>
            <span className="text-muted-foreground"> / </span>
            <span className="text-red-600">-{item.lineStats.deleted}</span>
          </span>
        )}

        {open ? (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
      </button>

      <ExpandableSection open={open}>
        <div className="ml-6 space-y-2 border-l border-border py-1.5 pl-3 text-xs">
          {item.input !== undefined && (
            <DetailSection label="Input" value={item.input} />
          )}
          {item.isError && item.errorText && (
            <DetailSection label="Error" value={item.errorText} isError />
          )}
          {item.isDone && item.output !== undefined && (
            <DetailSection label="Output" value={item.output} />
          )}
        </div>
      </ExpandableSection>
    </div>
  );
}

export const ActivityItemMemo = React.memo(
  ActivityItem,
  (prev, next) =>
    prev.item.key === next.item.key &&
    prev.item.state === next.item.state &&
    prev.item.isError === next.item.isError &&
    prev.item.isDone === next.item.isDone &&
    prev.item.outputSummary === next.item.outputSummary,
);
