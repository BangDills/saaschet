"use client";

import * as React from "react";
import { Check, X, ChevronDown, ChevronRight, Terminal, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExpandableSection } from "./ExpandableSection";
import type { ActivityGroupData, ActivityItem as ActivityItemType } from "./activity-types";

function CommandRow({
  item,
  isCode,
}: {
  item: ActivityItemType;
  isCode: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const Icon = isCode ? Play : Terminal;

  // Extract stdout/stderr from structured output (reliability refactor).
  const stdout = (() => {
    if (item.output && typeof item.output === "object") {
      const o = item.output as Record<string, unknown>;
      if (typeof o.stdout === "string") return o.stdout;
      if (typeof o.output === "string") return o.output; // legacy
    }
    return "";
  })();
  const stderr = (() => {
    if (item.output && typeof item.output === "object") {
      const o = item.output as Record<string, unknown>;
      if (typeof o.stderr === "string") return o.stderr;
    }
    return "";
  })();

  return (
    <div className="text-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group flex min-h-8 w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/40"
      >
        <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 max-w-[60vw] shrink-0 truncate font-mono text-xs text-foreground sm:max-w-none" title={item.inputPreview}>
          {item.inputPreview || item.reason}
        </span>
        {item.isDone && !item.isError && (
          <Check className="size-3 shrink-0 text-emerald-600" aria-hidden="true" />
        )}
        {item.isError && (
          <X className="size-3 shrink-0 text-destructive" aria-hidden="true" />
        )}
        {open ? (
          <ChevronDown className="ml-auto size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronRight className="ml-auto size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
      </button>

      <ExpandableSection open={open}>
        <div className="ml-6 space-y-1.5 border-l border-border py-1.5 pl-3 text-xs">
          {stdout && (
            <div>
              <p className="mb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">stdout</p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 font-mono text-[11px] text-foreground">{stdout}</pre>
            </div>
          )}
          {stderr && (
            <div>
              <p className="mb-0.5 text-[10px] uppercase tracking-wider text-destructive">stderr</p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-destructive/10 p-2 font-mono text-[11px] text-destructive">{stderr}</pre>
            </div>
          )}
          {!stdout && !stderr && item.errorText && (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-destructive/10 p-2 font-mono text-[11px] text-destructive">{item.errorText}</pre>
          )}
        </div>
      </ExpandableSection>
    </div>
  );
}

/**
 * Command/code group — shows $ cmd + ✓/✕, expand → stdout/stderr (not JSON).
 */
export function CommandGroup({
  group,
}: {
  group: ActivityGroupData;
}) {
  const isCode = group.id === "code";
  return (
    <div className="space-y-0.5">
      {group.items.map((item) => (
        <CommandRow key={item.key} item={item} isCode={isCode} />
      ))}
    </div>
  );
}
