"use client";

import * as React from "react";
import { ArrowUp, Globe, ImagePlus, GitBranch, Square } from "lucide-react";
import { ModelSelector } from "./model-selector";
import type { ModelInfo } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

export type ChatInputProps = {
  onSubmit: (text: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  placeholder?: string;
  /** model state */
  models: ModelInfo[];
  modelId: string;
  onModelChange: (id: string) => void;
  /** Layout variant: "centered" makes the box wider and used in hero state. */
  variant?: "default" | "centered";
};

/**
 * Kiro-inspired chat input.
 *
 *  ┌─────────────────────────────────────────────┐
 *  │ Ask a question or describe a task...   [↑]  │  ← textarea + send
 *  │                                              │
 *  │ ●                          [Llama 3.3 70B ⌄] │  ← status + model
 *  └─────────────────────────────────────────────┘
 *  [🌐] [📷]  [⎇ Select context]  ← bottom toolbar
 */
export function ChatInput({
  onSubmit,
  onStop,
  disabled,
  isStreaming,
  placeholder = "Ask a question or describe a task…",
  models,
  modelId,
  onModelChange,
  variant = "default",
}: ChatInputProps) {
  const [value, setValue] = React.useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea up to ~10 rows.
  const adjust = React.useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 280)}px`;
  }, []);

  React.useEffect(() => {
    adjust();
  }, [value, adjust]);

  function send() {
    const text = value.trim();
    if (!text || disabled) return;
    onSubmit(text);
    setValue("");
    requestAnimationFrame(adjust);
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const canSend = value.trim().length > 0 && !disabled;
  const widthClass =
    variant === "centered" ? "max-w-3xl" : "max-w-3xl";

  return (
    <div className={cn("mx-auto w-full", widthClass)}>
      {/* Main input box */}
      <div className="relative rounded-2xl border border-border bg-card shadow-sm transition-shadow focus-within:shadow-md">
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKey}
          placeholder={placeholder}
          rows={2}
          disabled={disabled}
          className="block w-full resize-none rounded-2xl bg-transparent px-4 pb-12 pt-4 text-[15px] outline-none placeholder:text-muted-foreground"
          style={{ minHeight: "112px" }}
        />

        {/* Send / stop button — absolute top-right */}
        {isStreaming ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generation"
            className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-xl bg-secondary text-secondary-foreground transition-colors hover:opacity-90"
          >
            <Square className="size-4 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            aria-label="Send message"
            className={cn(
              "absolute right-3 top-3 flex size-9 items-center justify-center rounded-xl transition-colors",
              canSend
                ? "bg-primary text-primary-foreground hover:opacity-90"
                : "bg-muted text-muted-foreground",
            )}
          >
            <ArrowUp className="size-4" />
          </button>
        )}

        {/* Bottom row inside the input: status + model selector */}
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2 px-2">
          <div className="flex items-center gap-2">
            <StatusDot streaming={!!isStreaming} />
          </div>
          <div className="flex items-center gap-2">
            <ModelSelector
              models={models}
              value={modelId}
              onChange={onModelChange}
            />
          </div>
        </div>
      </div>

      {/* Bottom toolbar (under the input, like Kiro) */}
      <div className="mt-2 flex items-center gap-1.5 px-1">
        <ToolbarButton title="Web search (coming soon)" disabled>
          <Globe className="size-4" />
        </ToolbarButton>
        <ToolbarButton title="Attach image (coming soon)" disabled>
          <ImagePlus className="size-4" />
        </ToolbarButton>
        <ToolbarButton title="Select context (coming soon)" disabled>
          <GitBranch className="size-4" />
          <span className="text-xs">Select context</span>
        </ToolbarButton>

        {/* Currently active context pill (placeholder, mimics Kiro's repo chip) */}
        <div className="ml-1 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground">
          <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
          <span className="font-medium">Horizon AI</span>
        </div>
      </div>

      <p className="mt-2 px-1 text-center text-[11px] text-muted-foreground">
        <kbd className="rounded border border-border px-1">Enter</kbd> to send ·{" "}
        <kbd className="rounded border border-border px-1">Shift+Enter</kbd> for
        new line
      </p>
    </div>
  );
}

/** Small pulsing dot — gradient when streaming, faint ring when idle. */
function StatusDot({ streaming }: { streaming: boolean }) {
  return (
    <div
      className={cn(
        "relative flex size-5 items-center justify-center",
        streaming && "animate-pulse",
      )}
      aria-hidden
    >
      <div
        className={cn(
          "size-4 rounded-full",
          streaming
            ? "bg-gradient-to-tr from-violet-500 via-fuchsia-500 to-rose-400"
            : "bg-transparent ring-2 ring-border",
        )}
      />
    </div>
  );
}

function ToolbarButton({
  children,
  disabled,
  title,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent",
      )}
    >
      {children}
    </button>
  );
}
