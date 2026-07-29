"use client";

import * as React from "react";
import { ArrowUpRight, GitBranch, GitPullRequest } from "lucide-react";
import type { PullRequestSummary } from "./pull-request-summary";

/**
 * The card that closes an agent turn: the pull request it opened, rendered as
 * a destination rather than a link buried in prose.
 */
export function PullRequestCard({ pr }: { pr: PullRequestSummary }) {
  const stats: string[] = [];
  if (pr.filesChanged > 0) stats.push(`${pr.filesChanged} file diubah`);
  if (pr.filesDeleted > 0) stats.push(`${pr.filesDeleted} file dihapus`);

  return (
    <a
      href={pr.url}
      target="_blank"
      rel="noreferrer"
      className="group my-3 flex items-start gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        <GitPullRequest className="size-4" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className="shrink-0 text-sm font-semibold text-foreground">
            #{pr.number}
          </span>
          <span className="truncate text-sm font-semibold text-foreground">
            {pr.title}
          </span>
        </span>

        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {stats.length > 0 && <span>{stats.join(" · ")}</span>}
          {pr.branch && pr.base && (
            <span className="flex min-w-0 items-center gap-1">
              <GitBranch className="size-3 shrink-0" />
              <span className="truncate font-mono text-[11px]">
                {pr.branch} → {pr.base}
              </span>
            </span>
          )}
        </span>
      </span>

      <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
    </a>
  );
}
