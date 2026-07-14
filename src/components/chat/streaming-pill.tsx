"use client";

import * as React from "react";
import { BrainCircuit, LoaderCircle, PenLine, Square } from "lucide-react";

export type StreamingPillProps = {
  charCount: number;
  startedAt: number;
  requestStatus: "submitted" | "streaming";
  onStop?: () => void;
};

type ActivityPhase = {
  label: string;
  description: string;
  icon: typeof BrainCircuit;
};

function getActivityPhase(
  requestStatus: StreamingPillProps["requestStatus"],
  charCount: number,
): ActivityPhase {
  if (requestStatus === "submitted") {
    return {
      label: "Thinking",
      description: "Understanding your request and preparing a response",
      icon: BrainCircuit,
    };
  }

  if (charCount === 0) {
    return {
      label: "Generating",
      description: "The model has started responding",
      icon: LoaderCircle,
    };
  }

  return {
    label: "Writing",
    description: "Streaming the response in real time",
    icon: PenLine,
  };
}

function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}:${seconds.toString().padStart(2, "0")}` : `${seconds}s`;
}

export function StreamingPill({
  charCount,
  startedAt,
  requestStatus,
  onStop,
}: StreamingPillProps) {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const elapsedSec = Math.max(0, Math.floor((now - startedAt) / 1000));
  const phase = getActivityPhase(requestStatus, charCount);
  const PhaseIcon = phase.icon;

  return (
    <div
      className="my-3 w-full max-w-xl rounded-xl border border-border bg-card p-3 text-card-foreground shadow-sm sm:p-4"
      role="status"
      aria-live="polite"
      aria-label={`${phase.label}. ${phase.description}`}
    >
      <div className="flex items-start gap-3">
        <div className="relative flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
          <PhaseIcon
            className="size-4 motion-safe:animate-pulse"
            aria-hidden="true"
          />
          <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-background ring-2 ring-foreground motion-safe:animate-pulse" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold leading-5">{phase.label}</p>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-foreground motion-safe:animate-pulse" />
              Live
            </span>
          </div>
          <p className="mt-0.5 text-pretty text-xs leading-5 text-muted-foreground sm:text-sm">
            {phase.description}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-md bg-muted px-2 py-1 font-mono tabular-nums">
              {formatElapsed(elapsedSec)}
            </span>
            {charCount > 0 && (
              <span className="rounded-md bg-muted px-2 py-1 tabular-nums">
                {charCount.toLocaleString()} characters received
              </span>
            )}
          </div>
        </div>

        {onStop && (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generation"
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Square className="size-3 fill-current" aria-hidden="true" />
            <span className="hidden sm:inline">Stop</span>
          </button>
        )}
      </div>
    </div>
  );
}
