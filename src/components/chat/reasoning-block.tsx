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
    <div className="my-2 rounded-lg border border-border bg-muted/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
      >
        {open ? (
          <ChevronDown className="size-3.5 shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" />
        )}
        <Brain
          className={cn(
            "size-3.5 shrink-0",
            inProgress && "animate-pulse text-violet-500",
          )}
        />
        <span>
          {inProgress
            ? "Thinking…"
            : `Reasoned for ~${seconds}s · ${charCount.toLocaleString()} chars`}
        </span>
      </button>
      {open && (
        <div className="border-t border-border px-3 py-2 text-[13px] text-muted-foreground">
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
