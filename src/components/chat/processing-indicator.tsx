"use client";

import * as React from "react";
import { BrainCircuit } from "lucide-react";

function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}:${seconds.toString().padStart(2, "0")}` : `${seconds}s`;
}

/** Shown when a restored conversation is still being processed by the server. */
export function ProcessingIndicator() {
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      className="my-3 w-full max-w-xl rounded-xl border border-border bg-card p-3 text-card-foreground shadow-sm sm:p-4"
      role="status"
      aria-live="polite"
      aria-label="Processing in background. Your conversation is still active."
    >
      <div className="flex items-start gap-3">
        <div className="relative flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
          <BrainCircuit
            className="size-4 motion-safe:animate-pulse"
            aria-hidden="true"
          />
          <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-background ring-2 ring-foreground motion-safe:animate-pulse" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold leading-5">Processing</p>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-foreground motion-safe:animate-pulse" />
              Background
            </span>
          </div>
          <p className="mt-0.5 text-pretty text-xs leading-5 text-muted-foreground sm:text-sm">
            Your conversation is still active. The result will appear here automatically.
          </p>
          <span className="mt-3 inline-flex rounded-md bg-muted px-2 py-1 font-mono text-xs tabular-nums text-muted-foreground">
            {formatElapsed(elapsed)}
          </span>
        </div>
      </div>
    </div>
  );
}
