"use client";

import * as React from "react";
import {
  ArrowUp,
  CheckCircle2,
  Globe,
  ImagePlus,
  Lock,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { ModelSelector } from "./model-selector";
import { RepoSelector } from "./repo-selector";
import type { ModelInfo } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

export type ChatInputProps = {
  onSubmit: (text: string, file?: { mediaType: string; base64: string; name: string } | null) => void;
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
  /** agent mode (auto-determined by model + repo) */
  agentMode: boolean;
  /** layout variant */
  variant?: "default" | "centered";
  /** Whether user has connected their OpenAI account. */
  openaiConnected?: boolean;
  /** GitHub Agent access mode for the connected repo. */
  githubAccessMode?: "unknown" | "read_only" | "full";
  /** Connected GitHub username, if available. */
  githubUsername?: string | null;
  /** Callback to open the OpenAI connect dialog. */
  onConnectOpenAI?: () => void;
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
  openaiConnected,
  githubAccessMode = "unknown",
  githubUsername,
  onConnectOpenAI,
}: ChatInputProps) {
  const [value, setValue] = React.useState("");
  const [selectedImage, setSelectedImage] = React.useState<{
    url: string;
    base64: string;
    mediaType: string;
    name: string;
  } | null>(null);

  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const activeModel = React.useMemo(() => {
    return models.find((m) => m.id === modelId);
  }, [models, modelId]);

  const isMultimodal = !!activeModel?.multimodal;

  const clearImage = React.useCallback(() => {
    if (selectedImage) {
      URL.revokeObjectURL(selectedImage.url);
      setSelectedImage(null);
    }
  }, [selectedImage]);

  React.useEffect(() => {
    return () => {
      if (selectedImage) {
        URL.revokeObjectURL(selectedImage.url);
      }
    };
  }, [selectedImage]);

  React.useEffect(() => {
    if (!isMultimodal && selectedImage) {
      clearImage();
    }
  }, [isMultimodal, selectedImage, clearImage]);

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
    if ((!text && !selectedImage) || disabled) return;
    onSubmit(
      text,
      selectedImage
        ? {
            mediaType: selectedImage.mediaType,
            base64: selectedImage.base64,
            name: selectedImage.name,
          }
        : null,
    );
    setValue("");
    clearImage();
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
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setSelectedImage({
        url: URL.createObjectURL(file),
        base64,
        mediaType: file.type,
        name: file.name,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  const canSend = (value.trim().length > 0 || selectedImage !== null) && !disabled;

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Main input box */}
      <div className="relative rounded-2xl border border-border bg-card shadow-sm transition-shadow focus-within:shadow-md">
        {selectedImage && (
          <div className="relative inline-block m-3 ml-4">
            <div className="relative size-16 overflow-hidden rounded-lg border border-border bg-muted">
              <img
                src={selectedImage.url}
                alt="Upload preview"
                className="size-full object-cover"
              />
              <button
                type="button"
                onClick={clearImage}
                className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/90 transition-colors cursor-pointer"
                aria-label="Remove image"
              >
                <X className="size-2.5" />
              </button>
            </div>
          </div>
        )}
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
            agentMode={agentMode}
            openaiConnected={openaiConnected}
            onConnectOpenAI={onConnectOpenAI}
          />
        </div>
      </div>

      {/* Bottom toolbar */}
      <div className="mt-2 flex items-center gap-1 px-1">
        {agentMode && (
          <div
            className="flex items-center gap-1 rounded-full bg-violet-500/15 px-2.5 py-1 text-xs font-medium text-violet-400"
            title="Agent Mode is active for the connected repo"
          >
            <Sparkles className="size-3.5" />
            Agent
          </div>
        )}

        {agentMode && repo && githubAccessMode !== "unknown" && (
          <AgentAccessBadge
            mode={githubAccessMode}
            username={githubUsername}
          />
        )}

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

        <ToolbarButton
          title={isMultimodal ? "Attach image" : "Selected model does not support vision/images"}
          disabled={!isMultimodal || disabled}
          onClick={handleImagePick}
        >
          <ImagePlus className="size-4" />
        </ToolbarButton>

        <RepoSelector value={repo} onChange={onRepoChange} />



        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={handleImageChosen}
        />
      </div>


    </div>
  );
}

function AgentAccessBadge({
  mode,
  username,
}: {
  mode: "read_only" | "full";
  username?: string | null;
}) {
  const isFull = mode === "full";
  const title = isFull
    ? username
      ? `Connected as ${username}. Agent write tools, branches, and PRs are enabled. GitHub may still reject writes if this account lacks repo permissions.`
      : "GitHub is connected. Agent write tools, branches, and PRs are enabled. GitHub may still reject writes if this account lacks repo permissions."
    : "Read-only Agent access for public repos. Connect GitHub to enable edits, branches, sandbox operations, and PRs.";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        isFull
          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
          : "bg-amber-500/15 text-amber-600 dark:text-amber-300",
      )}
      title={title}
    >
      {isFull ? <CheckCircle2 className="size-3.5" /> : <Lock className="size-3.5" />}
      {isFull ? "Full access" : "Read-only"}
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
