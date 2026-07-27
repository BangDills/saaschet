"use client";

import * as React from "react";
import { X, FileCode, FileText, Trash2, PencilLine } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActivityGroupData } from "./activity-types";

const FILE_OP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  created: FileCode,
  updated: PencilLine,
  deleted: Trash2,
};

/**
 * File operation group — shows filenames only, no code/JSON.
 * No success checkmarks — uses subtle icon tint for status.
 */
export function FileOperationGroup({
  group,
}: {
  group: ActivityGroupData;
}) {
  return (
    <div className="space-y-0.5">
      {group.items.map((item) => {
        const OpIcon = FILE_OP_ICONS[item.fileOp ?? "created"] ?? FileText;
        const textColor = item.isError
          ? "text-destructive"
          : "text-foreground";
        return (
          <div key={item.key}>
            <div className="flex min-h-7 items-center gap-2 px-1.5 py-0.5 text-sm">
              <OpIcon className={`size-3.5 shrink-0 ${textColor}`} aria-hidden="true" />
              <span
                className={`min-w-0 flex-1 truncate font-mono text-xs ${textColor}`}
                title={item.filePath ?? item.title}
              >
                {item.filePath ?? item.title}
              </span>
              {item.isRunning && (
                <span className="shrink-0 text-[10px] text-muted-foreground">…</span>
              )}
              {item.lineStats && (
                <span className="shrink-0 font-mono text-[10px] font-medium">
                  <span className="text-emerald-600">+{item.lineStats.added}</span>
                  <span className="text-muted-foreground"> / </span>
                  <span className="text-red-600">-{item.lineStats.deleted}</span>
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
