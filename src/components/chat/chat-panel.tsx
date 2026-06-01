"use client";

import * as React from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import type { ChatMessage, ModelInfo } from "@/lib/chat/types";
import { MessageBubble } from "./message-bubble";
import { ChatInput } from "./chat-input";
import { StreamingPill } from "./streaming-pill";

function partsToText(parts: UIMessage["parts"] | undefined): string {
  if (!parts) return "";
  return parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .filter(Boolean)
    .join("");
}

function toUIMessages(stored: ChatMessage[]): UIMessage[] {
  return stored.map((m) => ({
    id: m.id,
    role: m.role,
    parts: [{ type: "text" as const, text: m.content }],
  }));
}

export type ChatPanelProps = {
  /** Stable UUID for this chat. New chats get a fresh UUID; existing chats
   *  use their conversation row's id. Sent in the body of every /api/chat
   *  request so the server can upsert the conversation row. */
  conversationId: string;
  initialMessages: ChatMessage[];
  modelId: string;
  models: ModelInfo[];
  onModelChange: (id: string) => void;
  webSearch: boolean;
  onWebSearchChange: (next: boolean) => void;
  repo: string | null;
  onRepoChange: (next: string | null) => void;
  /** Called once the assistant finishes streaming, so the page can refresh
   *  the conversation list in the sidebar. */
  onAssistantFinish?: () => void;
};

export function ChatPanel({
  conversationId,
  initialMessages,
  modelId,
  models,
  onModelChange,
  webSearch,
  onWebSearchChange,
  repo,
  onRepoChange,
  onAssistantFinish,
}: ChatPanelProps) {
  // Keep the latest values in refs so the transport body callback always
  // picks them up even though the transport is created once.
  const modelIdRef = React.useRef(modelId);
  const webSearchRef = React.useRef(webSearch);
  const conversationIdRef = React.useRef(conversationId);
  const repoRef = React.useRef(repo);

  React.useEffect(() => {
    modelIdRef.current = modelId;
  }, [modelId]);
  React.useEffect(() => {
    webSearchRef.current = webSearch;
  }, [webSearch]);
  React.useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);
  React.useEffect(() => {
    repoRef.current = repo;
  }, [repo]);

  const transport = React.useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({
          conversationId: conversationIdRef.current,
          model: modelIdRef.current,
          webSearch: webSearchRef.current,
          repo: repoRef.current,
        }),
      }),
    [],
  );

  const { messages, sendMessage, status, stop, error } = useChat({
    id: conversationId,
    messages: toUIMessages(initialMessages),
    transport,
    onFinish: () => {
      onAssistantFinish?.();
    },
    // We hide streaming output behind a compact pill, so we throttle the
    // hook's internal updates aggressively. The pill re-renders on its
    // own 1Hz timer; everything else can wait for the final flush.
    experimental_throttle: 250,
  });

  const isStreaming = status === "submitted" || status === "streaming";

  // Track when the current assistant turn started, so the pill can show
  // elapsed time. Reset whenever streaming flips on.
  const [streamStartedAt, setStreamStartedAt] = React.useState<number | null>(
    null,
  );
  React.useEffect(() => {
    if (isStreaming && streamStartedAt === null) {
      setStreamStartedAt(Date.now());
    } else if (!isStreaming && streamStartedAt !== null) {
      setStreamStartedAt(null);
    }
  }, [isStreaming, streamStartedAt]);

  const hasMessages = messages.length > 0;

  // Hide the in-progress assistant message so the raw streaming text
  // never paints. Only the StreamingPill is shown until the message
  // finalizes, at which point it falls into the regular rendered list.
  const visibleMessages = React.useMemo(() => {
    if (!isStreaming) return messages;
    const last = messages[messages.length - 1];
    if (last?.role === "assistant") {
      return messages.slice(0, -1);
    }
    return messages;
  }, [messages, isStreaming]);

  // Char count for the pill — derived from the in-progress assistant
  // message so the user sees the work growing.
  const pendingCharCount = React.useMemo(() => {
    if (!isStreaming) return 0;
    const last = messages[messages.length - 1];
    if (last?.role !== "assistant") return 0;
    return partsToText(last.parts).length;
  }, [messages, isStreaming]);

  // Auto-scroll: only when content grows AND user hasn't scrolled up.
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const userScrolledUpRef = React.useRef(false);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function onScroll() {
      if (!el) return;
      const distanceFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight;
      userScrolledUpRef.current = distanceFromBottom > 60;
    }

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const lastScrollAtRef = React.useRef(0);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || userScrolledUpRef.current) return;
    const now = Date.now();
    if (now - lastScrollAtRef.current < 80) return;
    lastScrollAtRef.current = now;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [visibleMessages.length, isStreaming]);

  function handleSubmit(text: string) {
    if (!text.trim() || isStreaming) return;
    sendMessage({ text });
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {hasMessages ? (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl py-4">
              {visibleMessages.map((m) => {
                const text = partsToText(m.parts);
                return (
                  <MessageBubble
                    key={m.id}
                    role={m.role as ChatMessage["role"]}
                    content={text}
                  />
                );
              })}

              {isStreaming && streamStartedAt !== null && (
                <StreamingPill
                  charCount={pendingCharCount}
                  startedAt={streamStartedAt}
                  onStop={stop}
                />
              )}

              {error && (
                <div className="mx-4 my-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                  <strong className="font-semibold">Error:</strong>{" "}
                  {error.message}
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-border bg-background/80 px-4 py-3 backdrop-blur-md">
            <ChatInput
              onSubmit={handleSubmit}
              onStop={stop}
              isStreaming={isStreaming}
              disabled={isStreaming}
              models={models}
              modelId={modelId}
              onModelChange={onModelChange}
              webSearch={webSearch}
              onWebSearchChange={onWebSearchChange}
              repo={repo}
              onRepoChange={onRepoChange}
            />
          </div>
        </>
      ) : (
        /* Center hero — empty state, greeting only */
        <div className="flex h-full flex-col overflow-y-auto px-4 py-8">
          <div className="m-auto flex w-full max-w-3xl flex-col items-center gap-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Halo! 👋
              </h2>
              <p className="mt-2 text-base text-muted-foreground">
                Ada yang bisa saya bantu hari ini?
              </p>
            </div>

            <ChatInput
              variant="centered"
              onSubmit={handleSubmit}
              onStop={stop}
              isStreaming={isStreaming}
              disabled={isStreaming}
              models={models}
              modelId={modelId}
              onModelChange={onModelChange}
              webSearch={webSearch}
              onWebSearchChange={onWebSearchChange}
              repo={repo}
              onRepoChange={onRepoChange}
            />
          </div>
        </div>
      )}
    </div>
  );
}
