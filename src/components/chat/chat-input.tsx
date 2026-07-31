"use client";

import * as React from "react";
import {
  ArrowUp,
  FileText,
  Globe,
  Paperclip,
  Plus,
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
  placeholder = "Tanya apa saja atau jelaskan tugas Anda…",
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
  const [selectedFile, setSelectedFile] = React.useState<{
    url: string;
    base64: string;
    mediaType: string;
    name: string;
    isImage: boolean;
  } | null>(null);
  const [attachOpen, setAttachOpen] = React.useState(false);
  const attachRef = React.useRef<HTMLDivElement>(null);

  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const activeModel = React.useMemo(() => {
    return models.find((m) => m.id === modelId);
  }, [models, modelId]);

  const isMultimodal = !!activeModel?.multimodal;

  const clearFile = React.useCallback(() => {
    if (selectedFile?.isImage) {
      URL.revokeObjectURL(selectedFile.url);
    }
    setSelectedFile(null);
  }, [selectedFile]);

  React.useEffect(() => {
    return () => {
      if (selectedFile?.isImage) {
        URL.revokeObjectURL(selectedFile.url);
      }
    };
  }, [selectedFile]);

  // Close the attach menu on outside click / Escape.
  React.useEffect(() => {
    if (!attachOpen) return;
    function onClick(e: MouseEvent) {
      if (attachRef.current && !attachRef.current.contains(e.target as Node)) {
        setAttachOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAttachOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [attachOpen]);

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
    if ((!text && !selectedFile) || disabled) return;
    onSubmit(
      text,
      selectedFile
        ? {
            mediaType: selectedFile.mediaType,
            base64: selectedFile.base64,
            name: selectedFile.name,
          }
        : null,
    );
    onDraftChange("");
    clearFile();
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

  function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImage = file.type.startsWith("image/");

    // Cap uploads at 10 MB — large files bloat the request and eat credits.
    if (file.size > 10 * 1024 * 1024) {
      alert("File is larger than 10 MB. Please pick a smaller file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setSelectedFile({
        url: isImage ? URL.createObjectURL(file) : "",
        base64,
        mediaType: file.type || "application/octet-stream",
        name: file.name,
        isImage,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
    setAttachOpen(false);
  }

  const canSend = (draft.trim().length > 0 || selectedFile !== null) && !disabled;

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Main input box */}
      <div className="chat-composer relative rounded-2xl border border-border bg-card transition-shadow focus-within:border-input">
        {selectedFile && (
          <div className="relative inline-block m-3 ml-4">
            {selectedFile.isImage ? (
              <div className="relative size-16 overflow-hidden rounded-lg border border-border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedFile.url}
                  alt="Upload preview"
                  className="size-full object-cover"
                />
                <button
                  type="button"
                  onClick={clearFile}
                  className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/90 transition-colors cursor-pointer"
                  aria-label="Remove file"
                >
                  <X className="size-2.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted py-2 pl-2.5 pr-1.5">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="max-w-40 truncate text-xs font-medium">
                  {selectedFile.name}
                </span>
                <button
                  type="button"
                  onClick={clearFile}
                  className="flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                  aria-label="Remove file"
                >
                  <X className="size-3" />
                </button>
              </div>
            )}
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
            {/* "+" attach menu — Hyperagent-style. Upload file + Web search
                live here instead of as separate toolbar buttons. */}
            <div ref={attachRef} className="relative">
              <button
                type="button"
                title="Attach"
                aria-expanded={attachOpen}
                disabled={disabled}
                onClick={() => setAttachOpen((o) => !o)}
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent",
                  attachOpen && "bg-accent text-accent-foreground",
                )}
              >
                <Plus className="size-4" />
                <span className="sr-only">Attach</span>
              </button>

              {attachOpen && (
                <div className="absolute bottom-full left-0 z-50 mb-2 w-56 overflow-hidden rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg">
                  <button
                    type="button"
                    onClick={handleImagePick}
                    disabled={!isMultimodal && !selectedFile}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-accent disabled:opacity-50"
                  >
                    <Paperclip className="size-4" />
                    Upload file
                  </button>

                  <div className="my-1 border-t border-border" />

                  <button
                    type="button"
                    role="switch"
                    aria-checked={webSearch}
                    disabled={agentMode}
                    onClick={() => !agentMode && onWebSearchChange(!webSearch)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-accent disabled:opacity-50"
                  >
                    <Globe className="size-4" />
                    <span className="flex-1">Web search</span>
                    <span
                      className={cn(
                        "flex h-5 w-9 items-center rounded-full px-0.5 transition-colors",
                        webSearch ? "bg-foreground" : "bg-muted-foreground/30",
                      )}
                    >
                      <span
                        className={cn(
                          "size-4 rounded-full bg-background transition-transform",
                          webSearch && "translate-x-4",
                        )}
                      />
                    </span>
                  </button>
                </div>
              )}
            </div>

            <RepoSelector value={repo} onChange={onRepoChange} />
          </div>
          <ModelSelector
            models={models}
            value={modelId}
            onChange={(nextModelId) => {
              const nextModel = models.find((model) => model.id === nextModelId);
              if (!nextModel?.multimodal) clearFile();
              onModelChange(nextModelId);
            }}
            agentMode={agentMode}
          />
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,.pdf,.txt,.md,.markdown,.csv,.json,.ts,.tsx,.js,.py,.sql,.html,.css"
        className="hidden"
        onChange={handleFileChosen}
      />
    </div>
  );
}
