"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Check,
  X,
  AlertTriangle,
  FolderOpen,
  FileText,
  Search,
  Terminal,
  Play,
  FileCode,
  PencilLine,
  Trash2,
  GitPullRequest,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ExpandableSection } from "./ExpandableSection";
import { ActivityItemMemo } from "./ActivityItem";
import { FileOperationGroup } from "./FileOperationGroup";
import { CommandGroup } from "./CommandGroup";
import type { ActivityGroupData } from "./activity-types";

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  explore: FolderOpen,
  read: FileText,
  search: Search,
  commands: Terminal,
  code: Play,
  created: FileCode,
  updated: PencilLine,
  deleted: Trash2,
  other: GitPullRequest,
};

const MAX_VISIBLE = 5;

/**
 * Group shell: header (icon, label, count, status badge, chevron) +
 * expandable body. Body delegates to FileOperationGroup / CommandGroup /
 * ActivityItem depending on category. >15 items → first 5 + "+N more".
 */
export function ActivityGroup({
  group,
  streaming,
  onActionPrompt,
}: {
  group: ActivityGroupData;
  streaming: boolean;
  onActionPrompt?: (text: string) => void;
}) {
  const [expandedAfterCompletion, setExpandedAfterCompletion] = React.useState(false);
  const [showAll, setShowAll] = React.useState(false);
  const open = streaming || expandedAfterCompletion;

  const Icon = CATEGORY_ICONS[group.iconKey] ?? Wrench;
  const needsCollapse = group.count > 15;
  const visibleItems = needsCollapse && !showAll ? group.items.slice(0, MAX_VISIBLE) : group.items;
  const hiddenCount = group.count - MAX_VISIBLE;

  const isFileOp = group.id === "created" || group.id === "updated" || group.id === "deleted";
  const isCommand = group.id === "commands" || group.id === "code";

  return (
    <div className="mb-2 sm:mb-3">
      <button
        type="button"
        onClick={() => !streaming && setExpandedAfterCompletion((v) => !v)}
        aria-expanded={open}
        className="flex min-h-9 w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {streaming ? (
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none text-muted-foreground" aria-hidden="true" />
        ) : (
          <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
        )}

        <span className="shrink-0 text-xs font-medium text-foreground">{group.label}</span>
        <span className="shrink-0 text-xs text-muted-foreground">({group.count})</span>

        {/* Status badge */}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {group.status === "success" && (
            <Check className="size-3.5 text-emerald-600" aria-hidden="true" />
          )}
          {group.status === "failed" && (
            <X className="size-3.5 text-destructive" aria-hidden="true" />
          )}
          {group.status === "partial" && (
            <span className="flex items-center gap-0.5 text-[11px] text-amber-600 dark:text-amber-400">
              <AlertTriangle className="size-3" aria-hidden="true" />
              {group.failedCount} failed
            </span>
          )}
          {group.status === "running" && (
            <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none text-muted-foreground" aria-hidden="true" />
          )}
        </span>

        {!streaming && (open ? (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        ))}
      </button>

      <ExpandableSection open={open}>
        <div className="ml-2 border-l border-border pl-3">
          {isFileOp ? (
            <FileOperationGroup group={group} onActionPrompt={onActionPrompt} />
          ) : isCommand ? (
            <CommandGroup group={group} />
          ) : (
            visibleItems.map((item) => (
              <ActivityItemMemo key={item.key} item={item} onActionPrompt={onActionPrompt} />
            ))
          )}

          {needsCollapse && !showAll && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-1 px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              +{hiddenCount} more
            </button>
          )}
        </div>
      </ExpandableSection>
    </div>
  );
}
