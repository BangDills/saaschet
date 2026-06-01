"use client";

import * as React from "react";
import { Square } from "lucide-react";
import { cn } from "@/lib/utils";

export type StreamingPillProps = {
  /** length of accumulated text so far — drives the character counter */
  charCount: number;
  /** ms when the assistant turn started (Date.now()) */
  startedAt: number;
  /** optional stop handler — when present, a Stop button is rendered */
  onStop?: () => void;
};

/**
 * Compact "AI is working" indicator shown in place of the streaming
 * assistant bubble. Mirrors how Kiro shows tool activity: a single
 * line that ticks elapsed time + accumulated work, with a clear Stop
 * affordance — instead of dumping the raw streaming text into the
 * scroll view (which is what causes browser lag and visual noise).
 *
 * The actual text is only rendered ONCE, after streaming finishes,
 * via the regular MessageBubble path.
 */
export function StreamingPill({
  charCount,
  startedAt,
  onStop,
}: StreamingPillProps) {
  const [now, setNow] = React.useState(() => Date.now());

  // Tick once a second so the "17s" stays accurate without re-rendering
  // on every token.
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const elapsedSec = Math.max(0, Math.floor((now - startedAt) / 1000));

  return (
    <div className="flex w-full gap-3 px-4 py-4">
      <div className="flex size-9 shrink-0 items-center justify-center">
        <Spinner />
      </div>

      <div
        className={cn(
          "flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-2.5 text-sm",
          "shadow-sm",
        )}
      >
        <span className="font-medium text-foreground">Generating</span>
        <span className="text-muted-foreground">·</span>
        <span className="tabular-nums text-muted-foreground">
          {elapsedSec}s
        </span>
        {charCount > 0 && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="tabular-nums text-muted-foreground">
              {formatChars(charCount)}
            </span>
          </>
        )}

        {onStop && (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generation"
            className={cn(
              "ml-2 inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1",
              "text-xs font-medium text-foreground transition-colors hover:bg-accent",
            )}
          >
            <Square className="size-3 fill-current" />
            Stop
          </button>
        )}
      </div>
    </div>
  );
}

/** Tiny conic-gradient spinner — purely decorative. */
function Spinner() {
  return (
    <span
      aria-hidden
      className={cn(
        "size-5 rounded-full",
        "bg-[conic-gradient(from_0deg,var(--muted),transparent_60%,var(--foreground))]",
        "animate-spin",
      )}
      style={{ animationDuration: "1.2s" }}
    />
  );
}

function formatChars(n: number): string {
  if (n < 1000) return `${n} chars`;
  return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k chars`;
}
