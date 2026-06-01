"use client";

import * as React from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Sparkles } from "lucide-react";
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

/** Convert stored ChatMessages to UIMessages so useChat can hydrate. */
function toUIMessages(stored: ChatMessage[]): UIMessage[] {
  return stored.map((m) => ({
    id: m.id,
    role: m.role,
    parts: [{ type: "text" as const, text: m.content }],
  }));
}

export type ChatPanelProps = {
  /** key/id of the conversation; changes ⇒ chat resets */
  conversationId: string;
  initialMessages: ChatMessage[];
  modelId: string;
  models: ModelInfo[];
  onModelChange: (id: string) => void;
  /** called when messages change; receives plain ChatMessage[] */
  onMessagesChange: (messages: ChatMessage[]) => void;
};

const SUGGESTIONS: { title: string; prompt: string }[] = [
  {
    title: "Brainstorm SaaS ideas",
    prompt: "Brainstorm 5 SaaS startup ideas in healthtech for 2026",
  },
  {
    title: "Write a Python function",
    prompt:
      "Write a Python function that sorts a list of dictionaries by a given key",
  },
  {
    title: "Explain a concept",
    prompt: "Explain quantum computing in simple terms with an analogy",
  },
  {
    title: "Translate text",
    prompt:
      "Translate this to formal Indonesian: 'Hello, how are you doing today?'",
  },
];

export function ChatPanel({
  conversationId,
  initialMessages,
  modelId,
  models,
  onModelChange,
  onMessagesChange,
}: ChatPanelProps) {
  // Keep modelId in a ref so the body callback always uses the latest value
  // even though the transport is created once.
  const modelIdRef = React.useRef(modelId);
  React.useEffect(() => {
    modelIdRef.current = modelId;
  }, [modelId]);

  const transport = React.useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({ model: modelIdRef.current }),
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

  // Persist messages whenever they change.
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

  // Auto-scroll to bottom on new tokens.
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
          {/* Messages list */}
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

          {/* Bottom input */}
          <div className="border-t border-border bg-background/80 px-4 py-3 backdrop-blur-md">
            <ChatInput
              onSubmit={handleSubmit}
              onStop={stop}
              isStreaming={isStreaming}
              disabled={isStreaming}
              models={models}
              modelId={modelId}
              onModelChange={onModelChange}
            />
          </div>
        </>
      ) : (
        /* Center hero — empty state */
        <div className="flex h-full flex-col overflow-y-auto px-4 py-8">
          <div className="m-auto flex w-full max-w-3xl flex-col items-center gap-8">
            {/* Greeting */}
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Halo! 👋
              </h2>
              <p className="mt-2 text-base text-muted-foreground">
                Ada yang bisa saya bantu hari ini?
              </p>
            </div>

            {/* The input itself, centered */}
            <ChatInput
              variant="centered"
              onSubmit={handleSubmit}
              onStop={stop}
              isStreaming={isStreaming}
              disabled={isStreaming}
              models={models}
              modelId={modelId}
              onModelChange={onModelChange}
            />

            {/* Suggestions */}
            <div className="grid w-full max-w-3xl grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.title}
                  onClick={() => handleSubmit(s.prompt)}
                  disabled={isStreaming}
                  className="group flex items-start gap-3 rounded-xl border border-border bg-card p-3 text-left text-sm shadow-sm transition-colors hover:bg-accent disabled:opacity-60"
                >
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                  <div>
                    <p className="font-medium">{s.title}</p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      {s.prompt}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
