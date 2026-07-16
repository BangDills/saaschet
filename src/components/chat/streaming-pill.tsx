"use client";

import * as React from "react";
import { BrainCircuit } from "lucide-react";

export type StreamingPillProps = {
  charCount: number;
  startedAt: number;
  requestStatus: "submitted" | "streaming";
};

function getActivityLabel(
  requestStatus: StreamingPillProps["requestStatus"],
  charCount: number,
) {
  if (requestStatus === "submitted") return "Thinking";
  if (charCount === 0) return "Generating";
  return "Writing";
}

export function StreamingPill({
  charCount,
  startedAt,
  requestStatus,
}: StreamingPillProps) {
  const label = getActivityLabel(requestStatus, charCount);
  const [elapsedSeconds, setElapsedSeconds] = React.useState(() =>
    Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
  );

  React.useEffect(() => {
    const updateElapsed = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    };

    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return (
    <div
      className="my-3 flex items-center gap-2 text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
      aria-label={`${label} response`}
    >
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
        <BrainCircuit
          className="size-4 motion-safe:animate-pulse"
          aria-hidden="true"
        />
      </span>
      <span className="font-medium text-foreground">{label}</span>
      <span className="flex items-center gap-1" aria-hidden="true">
        <span className="size-1 rounded-full bg-muted-foreground motion-safe:animate-pulse" />
        <span className="size-1 rounded-full bg-muted-foreground motion-safe:animate-pulse [animation-delay:150ms]" />
        <span className="size-1 rounded-full bg-muted-foreground motion-safe:animate-pulse [animation-delay:300ms]" />
      </span>
      <span
        className="ml-1 font-mono text-xs tabular-nums text-muted-foreground"
        aria-label={`${elapsedSeconds} seconds elapsed`}
      >
        {elapsedSeconds}s
      </span>
    </div>
  );
}
