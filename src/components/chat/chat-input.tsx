"use client";

import * as React from "react";
import { Send, Square } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChatInputProps = {
  onSubmit: (text: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  placeholder?: string;
};

export function ChatInput({
  onSubmit,
  onStop,
  disabled,
  isStreaming,
  placeholder = "Send a message…",
}: ChatInputProps) {
  const [value, setValue] = React.useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea up to ~8 rows.
  const adjust = React.useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
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

  return (
    <div className="border-t border-border bg-background/80 px-4 py-3 backdrop-blur-md">
      <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring/30">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKey}
          placeholder={placeholder}
          rows={1}
          disabled={disabled}
          className={cn(
            "min-h-[2.25rem] flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] outline-none placeholder:text-muted-foreground",
            "max-h-60 overflow-y-auto",
          )}
        />
        {isStreaming ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generation"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground transition-colors hover:opacity-90"
          >
            <Square className="size-4 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={send}
            disabled={disabled || !value.trim()}
            aria-label="Send message"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-40"
          >
            <Send className="size-4" />
          </button>
        )}
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Press <kbd className="rounded border border-border px-1">Enter</kbd> to
        send · <kbd className="rounded border border-border px-1">Shift+Enter</kbd>{" "}
        for new line
      </p>
    </div>
  );
}
