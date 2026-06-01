"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type CreditSnapshot = {
  dailyLimit: number;
  usedToday: number;
  remaining: number;
  resetsAt: number;
  totalUsed: number;
};

const REFRESH_EVENT = "horizon-ai:credits:refresh";

/** Fire this anywhere in the app to ask the meter to re-fetch. */
export function fireCreditsRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(REFRESH_EVENT));
  }
}

function fmtResetsIn(resetsAt: number): string {
  const ms = Math.max(0, resetsAt - Date.now());
  const totalMins = Math.round(ms / 60_000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/**
 * Compact daily-credit progress bar shown in the sidebar.
 *
 * Polls /api/credits on mount and whenever the global
 * `horizon-ai:credits:refresh` event fires (after each chat finishes).
 */
export function CreditsMeter() {
  const [snap, setSnap] = React.useState<CreditSnapshot | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    try {
      const res = await fetch("/api/credits", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { credits?: CreditSnapshot };
      if (json.credits) setSnap(json.credits);
    } catch {
      // Network errors are non-fatal — the meter just stays stale.
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
    const handler = () => {
      refresh();
    };
    window.addEventListener(REFRESH_EVENT, handler);
    return () => window.removeEventListener(REFRESH_EVENT, handler);
  }, [refresh]);

  if (loading || !snap) {
    return (
      <div className="rounded-xl border border-sidebar-border bg-card p-3 text-xs text-muted-foreground">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-border" />
        </div>
      </div>
    );
  }

  const pct = Math.min(100, Math.round((snap.usedToday / snap.dailyLimit) * 100));
  const isLow = snap.remaining <= 5;
  const isEmpty = snap.remaining <= 0;

  return (
    <div
      className="rounded-xl border border-sidebar-border bg-card p-3"
      title={`Resets in ~${fmtResetsIn(snap.resetsAt)} (midnight UTC)`}
    >
      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 font-semibold">
          <Sparkles
            className={cn(
              "size-3.5",
              isEmpty
                ? "text-red-500"
                : isLow
                  ? "text-amber-500"
                  : "text-violet-500",
            )}
          />
          <span>Credits</span>
        </div>
        <span className="tabular-nums text-muted-foreground">
          {snap.remaining}/{snap.dailyLimit}
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            isEmpty
              ? "bg-red-500"
              : isLow
                ? "bg-amber-500"
                : "bg-gradient-to-r from-violet-500 to-fuchsia-500",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="mt-1.5 text-[10px] text-muted-foreground">
        {isEmpty
          ? `Daily limit reached · resets in ~${fmtResetsIn(snap.resetsAt)}`
          : `Resets in ~${fmtResetsIn(snap.resetsAt)}`}
      </p>
    </div>
  );
}
