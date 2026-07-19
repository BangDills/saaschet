"use client";

import * as React from "react";
import {
  ArrowUp,
  Globe,
  ImagePlus,
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
  /** Controlled composer draft shared with prompt suggestions. */
  draft: string;
  onDraftChange: (value: string) => void;
  /** Increment to move focus back to the composer. */
  focusRequestKey?: number;
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
  draft,
  onDraftChange,
  focusRequestKey = 0,
}: ChatInputProps) {
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

  const adjust = React.useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 280)}px`;
  }, []);

  React.useEffect(() => {
    adjust();
  }, [draft, adjust]);

  React.useEffect(() => {
    if (focusRequestKey > 0) textareaRef.current?.focus();
  }, [focusRequestKey]);

  function send() {
    const text = draft.trim();
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
    onDraftChange("");
    clearImage();
    requestAnimationFrame(adjust);
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
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

    // Cap uploads at 10 MB — larger images bloat the request, eat credits,
    // and often exceed the provider's context window anyway.
    if (file.size > 10 * 1024 * 1024) {
      alert("Image is larger than 10 MB. Please pick a smaller file.");
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

  const canSend = (draft.trim().length > 0 || selectedImage !== null) && !disabled;

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Main input box */}
      <div className="chat-composer relative rounded-2xl border border-border bg-card transition-shadow focus-within:border-input">
        {selectedImage && (
          <div className="relative inline-block m-3 ml-4">
            <div className="relative size-16 overflow-hidden rounded-lg border border-border bg-muted">
              {/* Blob previews are local and do not benefit from Next image optimization. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
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
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={handleKey}
          placeholder={placeholder}
          rows={2}
          disabled={disabled}
          className="block w-full resize-none rounded-2xl bg-transparent px-4 pb-14 pt-4 text-[15px] leading-6 outline-none placeholder:text-muted-foreground"
          style={{ minHeight: "104px" }}
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

        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-0.5">
            <ToolbarToggle
              active={webSearch}
              disabled={agentMode}
              onToggle={() => onWebSearchChange(!webSearch)}
              title={agentMode ? "Web search is always enabled in Agent mode" : webSearch ? "Disable web search" : "Enable web search"}
            >
              <Globe className="size-4" />
              <span className="sr-only">{agentMode ? "Web search automatically enabled in Agent mode" : webSearch ? "Web search enabled" : "Web search disabled"}</span>
            </ToolbarToggle>
            <ToolbarButton
              title={isMultimodal ? "Attach image" : "This model does not support images"}
              disabled={!isMultimodal || disabled}
              onClick={handleImagePick}
            >
              <ImagePlus className="size-4" />
              <span className="sr-only">Attach image</span>
            </ToolbarButton>
            <RepoSelector value={repo} onChange={onRepoChange} />
          </div>
          <ModelSelector
            models={models}
            value={modelId}
            onChange={(nextModelId) => {
              const nextModel = models.find((model) => model.id === nextModelId);
              if (!nextModel?.multimodal) clearImage();
              onModelChange(nextModelId);
            }}
            agentMode={agentMode}
          />
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleImageChosen}
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
        "inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors",
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
  disabled,
}: {
  children: React.ReactNode;
  active: boolean;
  onToggle: () => void;
  title?: string;
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
        "inline-flex size-8 items-center justify-center rounded-lg text-xs font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {children}
    </button>
  );
}
