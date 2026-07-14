"use client";

import * as React from "react";
import { BrainCircuit } from "lucide-react";

/**
 * Pulsing indicator shown when a conversation was restored from DB
 * and the server is still processing the AI response.
 */
export function ProcessingIndicator() {
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  return (
    <div
      className="my-3 flex items-center gap-2 py-1 text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <BrainCircuit className="size-4 shrink-0 animate-pulse" aria-hidden />
      <span>Agent is working</span>
      <span aria-hidden>·</span>
      <span className="font-mono text-xs tabular-nums">{timeStr}</span>
    </div>
  );
}
