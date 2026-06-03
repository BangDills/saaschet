"use client";

import * as React from "react";
import { Brain, ChevronDown, ChevronRight } from "lucide-react";
import { Markdown } from "./markdown";
import { cn } from "@/lib/utils";

export type ReasoningBlockProps = {
  /** Inner reasoning text (without the <think> tags) */
  content: string;
  /** Streaming = collapse content but keep header pulsing */
  streaming?: boolean;
  /** When true, the reasoning span is still being written by the model */
  inProgress?: boolean;
};

/**
 * Collapsible "thinking" block — what models like DeepSeek-R1 emit inside
 * `<think>...</think>` tags. Default state is collapsed because:
 *
 *   - Reasoning is often very long (10× the actual answer)
 *   - It's not the answer; it's the work
 *   - Re-rendering long Markdown on every token causes visible lag
 *
 * The component is `React.memo`-able because content is the only varying
 * prop, but we deliberately don't memoize during streaming so collapse
 * state still updates correctly.
 */
export function ReasoningBlock({
  content,
  streaming,
  inProgress,
}: ReasoningBlockProps) {
  const [open, setOpen] = React.useState(false);

  // Approximate "duration" by character count — purely cosmetic.
  const charCount = content.length;
  const seconds = Math.max(1, Math.round(charCount / 250));

  return (
    <div
      className={cn(
        "my-1.5 rounded-lg border transition-all duration-200",
        inProgress
          ? "border-violet-300/40 bg-violet-500/5 dark:border-violet-900/40"
          : "border-border/40 bg-muted/20 hover:bg-muted/30",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors"
      >
        {/* Expand chevron */}
        <span className="flex size-4 shrink-0 items-center justify-center">
          {open ? (
            <ChevronDown className="size-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3 text-muted-foreground" />
          )}
        </span>

        {/* Brain icon with accent bg */}
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-violet-500/10">
          <Brain
            className={cn(
              "size-3.5 text-violet-500 dark:text-violet-400",
              inProgress && "animate-pulse",
            )}
          />
        </span>

        {/* Label */}
        <span className="min-w-0 flex-1 font-medium text-foreground">
          {inProgress ? "Thinking…" : "Thought process"}
        </span>

        {/* Status */}
        <span className="flex shrink-0 items-center">
          {inProgress ? (
            <span className="flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-300">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-violet-500 opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-violet-500" />
              </span>
              thinking
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground">
              ~{seconds}s · {charCount.toLocaleString()} chars
            </span>
          )}
        </span>
      </button>
      {open && (
        <div className="border-t border-border/40 px-3 py-2.5 text-[13px] text-muted-foreground">
          {/* Use a lightweight pre-block while streaming — full Markdown
              parsing happens only when expanded AND content has stopped
              changing rapidly. */}
          {streaming ? (
            <pre className="whitespace-pre-wrap break-words font-sans leading-relaxed">
              {content}
            </pre>
          ) : (
            <Markdown className="text-[13px] text-muted-foreground">
              {content}
            </Markdown>
          )}
        </div>
      )}
    </div>
  );
}
