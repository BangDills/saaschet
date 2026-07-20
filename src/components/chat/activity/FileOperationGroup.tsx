"use client";

import * as React from "react";
import { Check, X, FileCode, FileText, Trash2, PencilLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { ActivityItemMemo } from "./ActivityItem";
import { ExpandableSection } from "./ExpandableSection";
import type { ActivityGroupData } from "./activity-types";

const FILE_OP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  created: FileCode,
  updated: PencilLine,
  deleted: Trash2,
};

/**
 * File operation group — shows filenames only (no code/JSON).
 * Created / Updated / Deleted categories. Each filename clickable to
 * expand the detail drawer (ActivityItem).
 */
export function FileOperationGroup({
  group,
  onActionPrompt,
}: {
  group: ActivityGroupData;
  onActionPrompt?: (text: string) => void;
}) {
  return (
    <div className="space-y-0.5">
      {group.items.map((item) => {
        const OpIcon = FILE_OP_ICONS[item.fileOp ?? "created"] ?? FileText;
        return (
          <div key={item.key} className="text-sm">
            <button
              type="button"
              onClick={() => {
                // Toggle detail via ActivityItem's internal state
                // — but we render it directly so it manages its own open.
              }}
              className="group flex min-h-8 w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/40"
            >
              <OpIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span
                className="min-w-0 max-w-[50vw] shrink-0 truncate font-mono text-xs text-foreground sm:max-w-none"
                title={item.filePath ?? item.reason}
              >
                {item.filePath ?? item.reason}
              </span>
              {item.isRunning && (
                <span className="shrink-0 text-[10px] text-muted-foreground">…</span>
              )}
              {item.isDone && !item.isError && (
                <Check className="size-3 shrink-0 text-emerald-600" aria-hidden="true" />
              )}
              {item.isError && (
                <X className="size-3 shrink-0 text-destructive" aria-hidden="true" />
              )}
              {item.lineStats && (
                <span className="ml-auto shrink-0 font-mono text-[10px] font-medium">
                  <span className="text-emerald-600">+{item.lineStats.added}</span>
                  <span className="text-muted-foreground"> / </span>
                  <span className="text-red-600">-{item.lineStats.deleted}</span>
                </span>
              )}
            </button>
            {/* Detail drawer — ActivityItem handles expand/collapse */}
            <ActivityItemMemo item={item} onActionPrompt={onActionPrompt} />
          </div>
        );
      })}
    </div>
  );
}
