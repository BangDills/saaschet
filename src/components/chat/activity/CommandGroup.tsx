"use client";

import * as React from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Terminal, Play } from "lucide-react";
import { ExpandableSection } from "./ExpandableSection";
import { formatElapsed } from "./summary-stats";
import type { ActivityGroupData, ActivityItem as ActivityItemType } from "./activity-types";

function CommandRow({
  item,
}: {
  item: ActivityItemType;
}) {
  const [open, setOpen] = React.useState(false);
  const [detailOpen, setDetailOpen] = React.useState(false);

  // Extract stdout/stderr/exit code from structured output.
  const out = (item.output && typeof item.output === "object"
    ? item.output
    : {}) as Record<string, unknown>;
  const stdout =
    typeof out.stdout === "string" ? out.stdout : typeof out.output === "string" ? out.output : "";
  const stderr = typeof out.stderr === "string" ? out.stderr : "";
  const exitCode = typeof out.exitCode === "number" ? out.exitCode : null;

  const needsAttention = item.status === "needs-attention";

  return (
    <div className="text-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group flex min-h-8 w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/40"
      >
        <span
          className={`size-3.5 shrink-0 ${
            needsAttention ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
          }`}
        >
          {item.status === "running" ? (
            <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : needsAttention ? (
            <AlertTriangle className="size-3.5" aria-hidden="true" />
          ) : item.category === "validating" ? (
            <Play className="size-3.5" aria-hidden="true" />
          ) : (
            <Terminal className="size-3.5" aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0 flex-1 text-xs text-foreground">
          <span className="block truncate font-medium">{item.title}</span>
          {open && item.description && (
            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
              {item.description}
            </span>
          )}
        </span>
        {needsAttention && (
          <span className="shrink-0 text-[10px] text-amber-600 dark:text-amber-400">
            Needs attention
          </span>
        )}
        {open ? (
          <ChevronDown className="ml-auto size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronRight className="ml-auto size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
      </button>

      <ExpandableSection open={open}>
        <div className="ml-6 space-y-1.5 border-l border-border py-1.5 pl-3 text-xs">
          {item.description && (
            <p className="text-[11px] text-muted-foreground">{item.description}</p>
          )}

          {/* Technical Details — the raw command, streams, exit code */}
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
            <div className="space-y-1.5">
              {(exitCode != null || item.durationMs != null) && (
                <p className="text-[11px] text-muted-foreground">
                  {[
                    exitCode != null ? `Exit code: ${exitCode}` : null,
                    item.durationMs != null ? formatElapsed(item.durationMs) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              {item.technicalDetails && (
                <div>
                  <p className="mb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">Command</p>
                  <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 font-mono text-[11px] text-foreground">
                    $ {item.technicalDetails}
                  </pre>
                </div>
              )}

              {/* stdout / stderr */}
              {stdout && (
                <div>
                  <p className="mb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">stdout</p>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 font-mono text-[11px] text-foreground">{stdout}</pre>
                </div>
              )}
              {stderr && (
                <div>
                  <p className="mb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">stderr</p>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 font-mono text-[11px] text-foreground">{stderr}</pre>
                </div>
              )}
              {!stdout && !stderr && item.errorText && (
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-destructive/10 p-2 font-mono text-[11px] text-destructive">{item.errorText}</pre>
              )}
            </div>
          </ExpandableSection>
        </div>
      </ExpandableSection>
    </div>
  );
}

export function CommandGroup({
  group,
}: {
  group: ActivityGroupData;
}) {
  return (
    <div className="space-y-0.5">
      {group.items.map((item) => (
        <CommandRow key={item.key} item={item} />
      ))}
    </div>
  );
}
