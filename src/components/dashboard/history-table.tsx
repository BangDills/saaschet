"use client";

import * as React from "react";
import { Bot, MessageSquare, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type HistoryRow = {
  id: string;
  kind: "chat" | "agent";
  cost: number;
  modelId: string | null;
  toolCount: number;
  createdAt: string;
  conversationId: string | null;
  conversationTitle: string | null;
};

type DateRange = "7d" | "30d" | "all";

const PAGE_SIZE = 10;

function KindBadge({ kind }: { kind: "chat" | "agent" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold",
        kind === "agent"
          ? "bg-violet-500/15 text-violet-600 dark:text-violet-300"
          : "bg-sky-500/15 text-sky-600 dark:text-sky-300",
      )}
    >
      {kind === "agent" ? (
        <Bot className="size-3" />
      ) : (
        <MessageSquare className="size-3" />
      )}
      {kind === "agent" ? "Agent" : "Chat"}
    </span>
  );
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: diffDay > 365 ? "numeric" : undefined,
  });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HistoryTable({ rows }: { rows: HistoryRow[] }) {
  const [range, setRangeRaw] = React.useState<DateRange>("30d");
  const [page, setPage] = React.useState(0);
  // Track a snapshot of "now" so useMemo stays pure. Updated when range changes.
  const [now, setNow] = React.useState(() => Date.now());

  const setRange = React.useCallback((r: DateRange) => {
    setRangeRaw(r);
    setPage(0);
    setNow(Date.now());
  }, []);

  const filtered = React.useMemo(() => {
    if (range === "all") return rows;
    const cutoff =
      range === "7d" ? now - 7 * 86_400_000 : now - 30 * 86_400_000;
    return rows.filter((r) => new Date(r.createdAt).getTime() >= cutoff);
  }, [rows, range, now]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageRows = filtered.slice(
    page * PAGE_SIZE,
    page * PAGE_SIZE + PAGE_SIZE,
  );
  const totalCredits = filtered.reduce((s, r) => s + r.cost, 0);

  return (
    <div className="space-y-4">
      {/* Filters + stats */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {(["7d", "30d", "all"] as DateRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                range === r
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {r === "7d" ? "7 days" : r === "30d" ? "30 days" : "All time"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>
            <strong className="font-semibold text-foreground">
              {filtered.length}
            </strong>{" "}
            {filtered.length === 1 ? "entry" : "entries"}
          </span>
          <span>
            <strong className="font-semibold text-foreground">
              {totalCredits}
            </strong>{" "}
            credits used
          </span>
        </div>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left">
            <thead>
              <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3 text-center">Tools</th>
                <th className="px-4 py-3 text-right">Cost</th>
                <th className="px-4 py-3">Conversation</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-sm text-muted-foreground"
                  >
                    No usage history yet — start a chat to see activity here.
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border text-sm transition-colors last:border-0 hover:bg-muted/50"
                  >
                    <td
                      className="px-4 py-3 text-muted-foreground"
                      title={formatDate(row.createdAt)}
                    >
                      {timeAgo(row.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <KindBadge kind={row.kind} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {row.modelId
                        ? row.modelId.replace(/^(anthropic-|openai-|deepseek-)/, "")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums text-muted-foreground">
                      {row.toolCount > 0 ? row.toolCount : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">
                      {row.cost}
                    </td>
                    <td className="px-4 py-3">
                      {row.conversationTitle ? (
                        <a
                          href="/ai-chat"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                          title={row.conversationTitle}
                        >
                          <span className="max-w-[140px] truncate">
                            {row.conversationTitle}
                          </span>
                          <ExternalLink className="size-3 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Page {page + 1} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
