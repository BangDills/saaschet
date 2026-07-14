"use client";

import * as React from "react";
import { BrainCircuit, Square } from "lucide-react";

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
    <div
      className="flex w-full items-center gap-2 py-3 text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <BrainCircuit className="size-4 animate-pulse" aria-hidden />
      <span>Generating</span>
      <span aria-hidden>·</span>
      <span className="tabular-nums">{elapsedSec}s</span>
      {onStop && (
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop generation"
          className="ml-1 inline-flex size-7 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
        >
          <Square className="size-3 fill-current" />
        </button>
      )}
    </div>
  );
}
