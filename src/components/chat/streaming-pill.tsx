"use client";

import { Square } from "lucide-react";
import { CeliuzLogo } from "@/components/celiuz-logo";

export type StreamingPillProps = {
  charCount: number;
  startedAt: number;
  requestStatus: "submitted" | "streaming";
  onStop?: () => void;
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
  requestStatus,
  onStop,
}: StreamingPillProps) {
  const label = getActivityLabel(requestStatus, charCount);

  return (
    <div
      className="my-3 flex items-center gap-2 text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
      aria-label={`${label} response`}
    >
      <CeliuzLogo className="size-5 rounded-md" />
      <span className="font-medium text-foreground">{label}</span>
      <span className="flex items-center gap-1" aria-hidden="true">
        <span className="size-1 rounded-full bg-muted-foreground motion-safe:animate-pulse" />
        <span className="size-1 rounded-full bg-muted-foreground motion-safe:animate-pulse [animation-delay:150ms]" />
        <span className="size-1 rounded-full bg-muted-foreground motion-safe:animate-pulse [animation-delay:300ms]" />
      </span>

      {onStop && (
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop generation"
          className="ml-1 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Square className="size-2.5 fill-current" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
