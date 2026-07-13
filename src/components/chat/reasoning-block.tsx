"use client";

import * as React from "react";
import { Activity, ChevronDown, ChevronRight } from "lucide-react";
import { Markdown } from "./markdown";

export type ReasoningBlockProps = {
  content: string;
  streaming?: boolean;
  inProgress?: boolean;
};

export function ReasoningBlock({
  content,
  streaming,
  inProgress,
}: ReasoningBlockProps) {
  const [open, setOpen] = React.useState(false);
  const seconds = Math.max(1, Math.round(content.length / 250));

  return (
    <div className="my-3 text-sm text-muted-foreground">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex items-center gap-2 py-1 text-left transition-colors hover:text-foreground"
      >
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        <Activity className={inProgress ? "size-4 animate-pulse" : "size-4"} />
        <span>{inProgress ? "Thinking" : `Worked for ${seconds}s`}</span>
      </button>
      {open && (
        <div className="mt-2 border-l border-border pl-4 text-[13px] leading-relaxed">
          {streaming ? (
            <pre className="whitespace-pre-wrap break-words font-sans">{content}</pre>
          ) : (
            <Markdown className="text-[13px] text-muted-foreground">{content}</Markdown>
          )}
        </div>
      )}
    </div>
  );
}
