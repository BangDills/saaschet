"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, Terminal, Play } from "lucide-react";
import { ExpandableSection } from "./ExpandableSection";
import type { ActivityGroupData, ActivityItem as ActivityItemType } from "./activity-types";

function CommandRow({
  item,
}: {
  item: ActivityItemType;
}) {
  const [open, setOpen] = React.useState(false);

  // Extract stdout/stderr from structured output.
  const stdout = (() => {
    if (item.output && typeof item.output === "object") {
      const o = item.output as Record<string, unknown>;
      if (typeof o.stdout === "string") return o.stdout;
      if (typeof o.output === "string") return o.output;
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
        <span className={`size-3.5 shrink-0 ${item.isError ? 'text-destructive' : 'text-muted-foreground'}`}>
          {item.title === "Running validation" ? (
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

          {/* Technical Details — raw command */}
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
