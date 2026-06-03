"use client";

import * as React from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import type { ChatMessage, ModelInfo } from "@/lib/chat/types";
import { MessageBubble, type AnyPart } from "./message-bubble";
import { ChatInput } from "./chat-input";
import { StreamingPill } from "./streaming-pill";
import { fireCreditsRefresh } from "@/components/dashboard/credits-meter";

function partsToText(parts: UIMessage["parts"] | undefined): string {
  if (!parts) return "";
  return parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .filter(Boolean)
    .join("");
}

/** Map an AI SDK UIMessage's parts to MessageBubble's `AnyPart` shape. */
function toBubbleParts(parts: UIMessage["parts"] | undefined): AnyPart[] {
  if (!parts) return [];
  return parts
    .filter(
      (p) =>
        p.type === "text" ||
        p.type === "dynamic-tool" ||
        (typeof p.type === "string" && p.type.startsWith("tool-")),
    )
    .map((p) => p as AnyPart);
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
   *  use their conversation row's id. */
  conversationId: string;
  initialMessages: ChatMessage[];
  modelId: string;
  models: ModelInfo[];
  onModelChange: (id: string) => void;
  webSearch: boolean;
  onWebSearchChange: (next: boolean) => void;
  repo: string | null;
  onRepoChange: (next: string | null) => void;
  agentMode: boolean;
  onAgentModeChange: (next: boolean) => void;
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
  agentMode,
  onAgentModeChange,
  onAssistantFinish,
}: ChatPanelProps) {
  // Refs for the transport body callback.
  const modelIdRef = React.useRef(modelId);
  const webSearchRef = React.useRef(webSearch);
  const conversationIdRef = React.useRef(conversationId);
  const repoRef = React.useRef(repo);
  const agentModeRef = React.useRef(agentMode);

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
  React.useEffect(() => {
    agentModeRef.current = agentMode;
  }, [agentMode]);

  const transport = React.useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({
          conversationId: conversationIdRef.current,
          model: modelIdRef.current,
          webSearch: webSearchRef.current,
          repo: repoRef.current,
          agentMode: agentModeRef.current,
        }),
      }),
    [],
  );

  const { messages, sendMessage, status, stop, error } = useChat({
    id: conversationId,
    messages: toUIMessages(initialMessages),
    transport,
    onFinish: () => {
      fireCreditsRefresh();
      onAssistantFinish?.();
    },
    // In agent mode the user wants to SEE tool calls happen in real time.
    // In chat mode the streaming text is hidden behind a pill so we can
    // throttle aggressively. Pick the rate at construction time.
    experimental_throttle: agentModeRef.current ? 80 : 250,
  });

  const isStreaming = status === "submitted" || status === "streaming";

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

  /**
   * In **chat mode**, hide the in-progress assistant message and show the
   * StreamingPill instead — its raw streaming text would lag the browser.
   *
   * In **agent mode**, the assistant message is shown live so the user
   * can watch tool calls execute (read_file, write_file, etc.). Tool
   * panels are individually memoized so this is cheap.
   */
  const visibleMessages = React.useMemo(() => {
    if (!isStreaming || agentMode) return messages;
    const last = messages[messages.length - 1];
    if (last?.role === "assistant") {
      return messages.slice(0, -1);
    }
    return messages;
  }, [messages, isStreaming, agentMode]);

  const pendingCharCount = React.useMemo(() => {
    if (!isStreaming) return 0;
    const last = messages[messages.length - 1];
    if (last?.role !== "assistant") return 0;
    return partsToText(last.parts).length;
  }, [messages, isStreaming]);

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

  // The input pill at the bottom (or center for hero) is the same in both
  // modes — the page-level state controls the toggles.
  const inputProps = {
    onSubmit: handleSubmit,
    onStop: stop,
    isStreaming,
    disabled: isStreaming,
    models,
    modelId,
    onModelChange,
    webSearch,
    onWebSearchChange,
    repo,
    onRepoChange,
    agentMode,
    onAgentModeChange,
  } as const;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {hasMessages ? (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl py-4">
              {visibleMessages.map((m) => {
                const isLast =
                  m.id === messages[messages.length - 1]?.id;
                const isStreamingThis =
                  isStreaming && isLast && m.role === "assistant";
                if (m.role === "assistant") {
                  return (
                    <MessageBubble
                      key={m.id}
                      role="assistant"
                      parts={toBubbleParts(m.parts)}
                      streaming={isStreamingThis}
                    />
                  );
                }
                return (
                  <MessageBubble
                    key={m.id}
                    role={m.role as ChatMessage["role"]}
                    content={partsToText(m.parts)}
                  />
                );
              })}

              {/* Chat-mode streaming pill: only when NOT in agent mode and the
                  assistant turn is in flight. */}
              {isStreaming &&
                !agentMode &&
                streamStartedAt !== null && (
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

          <div className="bg-background px-4 py-3">
            <ChatInput {...inputProps} />
          </div>
        </>
      ) : (
        <div className="flex h-full flex-col overflow-y-auto px-4">
          <div className="flex-1" />
          <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-8">

            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Halo! 👋
              </h2>
              <p className="mt-2 text-base text-muted-foreground">
                Ada yang bisa saya bantu hari ini?
              </p>
            </div>

            <ChatInput variant="centered" {...inputProps} />
          </div>
          <div className="shrink-0 pb-4 sm:pb-8" />
        </div>
      )}
    </div>
  );
}
