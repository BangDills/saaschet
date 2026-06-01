"use client";

import * as React from "react";
import { ArrowUp, Globe, ImagePlus, Sparkles, Square } from "lucide-react";
import { ModelSelector } from "./model-selector";
import { RepoSelector } from "./repo-selector";
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
  /** web search toggle */
  webSearch: boolean;
  onWebSearchChange: (next: boolean) => void;
  /** repo selector state (owner/name or null) */
  repo: string | null;
  onRepoChange: (next: string | null) => void;
  /** agent mode toggle (read+write tools) */
  agentMode: boolean;
  onAgentModeChange: (next: boolean) => void;
  /** layout variant */
  variant?: "default" | "centered";
};

/**
 * Kiro-inspired chat input.
 *
 *  ┌─────────────────────────────────────────────┐
 *  │ Ask a question or describe a task...   [↑]  │
 *  │                                              │
 *  │ ●                          [Llama 3.3 70B ⌄] │
 *  └─────────────────────────────────────────────┘
 *  [🌐 Web] [📷] [⎇ Select repo]   [pill]
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
  webSearch,
  onWebSearchChange,
  repo,
  onRepoChange,
  agentMode,
  onAgentModeChange,
}: ChatInputProps) {
  const [value, setValue] = React.useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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

  function handleImagePick() {
    fileInputRef.current?.click();
  }

  function handleImageChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    alert(
      `Image picked: ${file.name}\n\nMultimodal vision support is queued — for now your prompt is sent as text only.`,
    );
  }

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Main input box */}
      <div className="relative rounded-2xl border border-border bg-card shadow-sm transition-shadow focus-within:shadow-md">
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

        {/* Bottom row: status + model selector */}
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2 px-2">
          <StatusDot streaming={!!isStreaming} />
          <ModelSelector
            models={models}
            value={modelId}
            onChange={onModelChange}
          />
        </div>
      </div>

      {/* Bottom toolbar */}
      <div className="mt-2 flex items-center gap-1 px-1">
        <ToolbarToggle
          active={agentMode}
          variant="violet"
          onToggle={() => onAgentModeChange(!agentMode)}
          title={
            !repo
              ? "Connect a repo first to enable Agent Mode"
              : agentMode
                ? "Agent Mode ON — the model can read, edit, and open PRs in the connected repo"
                : "Enable Agent Mode (multi-step tool use)"
          }
          label={agentMode ? "Agent ON" : "Agent"}
          disabled={!repo}
        >
          <Sparkles className="size-4" />
        </ToolbarToggle>

        <ToolbarToggle
          active={webSearch}
          onToggle={() => onWebSearchChange(!webSearch)}
          title={
            webSearch
              ? "Web search ON — results will be added to the AI's context"
              : "Enable web search (Tavily)"
          }
          label={webSearch ? "Web ON" : "Web"}
        >
          <Globe className="size-4" />
        </ToolbarToggle>

        <ToolbarButton title="Attach an image" onClick={handleImagePick}>
          <ImagePlus className="size-4" />
        </ToolbarButton>

        <RepoSelector value={repo} onChange={onRepoChange} />

        {/* Active context pill */}
        <div className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground">
          <span
            className={cn(
              "inline-block size-1.5 rounded-full",
              agentMode
                ? "animate-pulse bg-violet-500"
                : webSearch
                  ? "animate-pulse bg-sky-500"
                  : "bg-emerald-500",
            )}
          />
          <span className="font-medium">
            {repo ?? "Horizon AI"}
            {agentMode ? " · Agent" : webSearch ? " · Web" : ""}
          </span>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={handleImageChosen}
        />
      </div>

      <p className="mt-2 px-1 text-center text-[11px] text-muted-foreground">
        <kbd className="rounded border border-border px-1">Enter</kbd> to send ·{" "}
        <kbd className="rounded border border-border px-1">Shift+Enter</kbd> for
        new line
      </p>
    </div>
  );
}

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

function ToolbarToggle({
  children,
  active,
  onToggle,
  title,
  label,
  variant = "sky",
  disabled,
}: {
  children: React.ReactNode;
  active: boolean;
  onToggle: () => void;
  title?: string;
  label?: string;
  variant?: "sky" | "violet";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={title}
      aria-pressed={active}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
        active && variant === "sky" && "bg-sky-500/15 text-sky-600 dark:text-sky-300",
        active &&
          variant === "violet" &&
          "bg-violet-500/15 text-violet-600 dark:text-violet-300",
        !active &&
          "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {children}
      {label && <span>{label}</span>}
    </button>
  );
}
