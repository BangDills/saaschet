"use client";

import * as React from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import type { ChatMessage, ModelInfo } from "@/lib/chat/types";
import { MessageBubble } from "./message-bubble";
import { ChatInput } from "./chat-input";

/** Convert the AI SDK's UIMessage parts to plain text for storage. */
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
  conversationId: string;
  initialMessages: ChatMessage[];
  modelId: string;
  models: ModelInfo[];
  onModelChange: (id: string) => void;
  webSearch: boolean;
  onWebSearchChange: (next: boolean) => void;
  repo: string | null;
  onRepoChange: (next: string | null) => void;
  onMessagesChange: (messages: ChatMessage[]) => void;
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
  onMessagesChange,
}: ChatPanelProps) {
  const modelIdRef = React.useRef(modelId);
  const webSearchRef = React.useRef(webSearch);

  React.useEffect(() => {
    modelIdRef.current = modelId;
  }, [modelId]);
  React.useEffect(() => {
    webSearchRef.current = webSearch;
  }, [webSearch]);

  const transport = React.useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({
          model: modelIdRef.current,
          webSearch: webSearchRef.current,
        }),
      }),
    [],
  );

  const { messages, sendMessage, status, stop, error } = useChat({
    id: conversationId,
    messages: toUIMessages(initialMessages),
    transport,
  });

  const isStreaming = status === "submitted" || status === "streaming";
  const hasMessages = messages.length > 0;

  React.useEffect(() => {
    const plain: ChatMessage[] = messages.map((m) => ({
      id: m.id,
      role: m.role as ChatMessage["role"],
      content: partsToText(m.parts),
      createdAt: Date.now(),
    }));
    onMessagesChange(plain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, status]);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

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
              {messages.map((m, i) => {
                const text = partsToText(m.parts);
                const isLast = i === messages.length - 1;
                const isStreamingThis =
                  isLast && m.role === "assistant" && isStreaming;
                return (
                  <MessageBubble
                    key={m.id}
                    role={m.role as ChatMessage["role"]}
                    content={
                      isStreamingThis && !text ? "Thinking…" : text
                    }
                    streaming={isStreamingThis && !!text}
                  />
                );
              })}
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
