"use client";

import * as React from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CircleSlash,
  Loader2,
  MinusCircle,
} from "lucide-react";
import { TOOL_META, FALLBACK_META, DetailSection } from "../tool-call";
import { ExpandableSection } from "./ExpandableSection";
import { formatElapsed } from "./summary-stats";
import type { ActivityItem as ActivityItemType } from "./activity-types";

function getMetaIcon(toolName: string): React.ComponentType<{ className?: string }> {
  const meta = TOOL_META[toolName] ?? FALLBACK_META;
  return meta.Icon;
}

/** Short user-facing label for non-nominal outcomes. */
const STATUS_LABELS: Record<string, string> = {
  "needs-attention": "Needs attention",
  unavailable: "Unavailable",
  skipped: "Skipped",
};

function StatusIcon({ item, Icon }: { item: ActivityItemType; Icon: React.ComponentType<{ className?: string }> }) {
  switch (item.status) {
    case "running":
      return <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />;
    case "needs-attention":
      return <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />;
    case "unavailable":
      return <CircleSlash className="size-3.5 text-muted-foreground" aria-hidden="true" />;
    case "skipped":
      return <MinusCircle className="size-3.5 text-muted-foreground" aria-hidden="true" />;
    default:
      return <Icon className="size-3.5" aria-hidden="true" />;
  }
}

export function ActivityItem({
  item,
}: {
  item: ActivityItemType;
  onActionPrompt?: (text: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const Icon = getMetaIcon(item.toolName);
  const statusLabel = STATUS_LABELS[item.status];

  return (
    <div className="text-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group flex min-h-8 w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
          <StatusIcon item={item} Icon={Icon} />
        </span>

        <span className="min-w-0 flex-1 text-xs text-foreground">
          <span className="block truncate font-medium">{item.title}</span>
          {open && item.description && (
            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
              {item.description}
            </span>
          )}
        </span>

        {statusLabel && (
          <span
            className={`shrink-0 text-[10px] ${
              item.status === "needs-attention"
                ? "text-amber-600 dark:text-amber-400"
                : "text-muted-foreground"
            }`}
          >
            {statusLabel}
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
          {/* Description (always visible on expand) */}
          {item.description && (
            <p className="text-[11px] text-muted-foreground">{item.description}</p>
          )}

          {/* Technical Details — only shown on explicit click */}
          {(item.technicalDetails || item.inputPreview || item.errorText || item.durationMs != null) && (
            <>
              <button
                type="button"
                onClick={() => setDetailOpen((o) => !o)}
                className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                {detailOpen ? (
                  <ChevronDown className="size-3" aria-hidden="true" />
                ) : (
                  <ChevronRight className="size-3" aria-hidden="true" />
                )}
                Technical Details
              </button>
              <ExpandableSection open={detailOpen}>
                <div className="space-y-2">
                  {item.durationMs != null && (
                    <p className="text-[11px] text-muted-foreground">
                      Duration: {formatElapsed(item.durationMs)}
                    </p>
                  )}
                  {item.technicalDetails && (
                    <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 font-mono text-[11px] text-foreground">
                      {item.technicalDetails}
                    </pre>
                  )}
                  {item.errorText && (
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-destructive/10 p-2 font-mono text-[11px] text-destructive">
                      {item.errorText}
                    </pre>
                  )}
                  {item.input !== undefined && (
                    <DetailSection label="Input" value={item.input} />
                  )}
                  {item.isDone && item.output !== undefined && (
                    <DetailSection label="Output" value={item.output} />
                  )}
                </div>
              </ExpandableSection>
            </>
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
    prev.item.status === next.item.status &&
    prev.item.isDone === next.item.isDone &&
    prev.item.outputSummary === next.item.outputSummary,
);
