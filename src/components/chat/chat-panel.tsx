"use client";

import * as React from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Bot, Sparkles } from "lucide-react";
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

export type ChatPanelHandle = {
  send: (text: string) => void;
};

export type ChatPanelProps = {
  /** key/id of the conversation; changes ⇒ chat resets */
  conversationId: string;
  initialMessages: ChatMessage[];
  modelId: string;
  models: ModelInfo[];
  /** called when messages change; receives plain ChatMessage[] */
  onMessagesChange: (messages: ChatMessage[]) => void;
};

const SUGGESTIONS = [
  "Explain quantum computing in simple terms",
  "Write a Python function to sort a list of dicts",
  "Brainstorm 5 startup ideas in healthtech",
  "Translate this to Indonesian: 'Hello, how are you?'",
];

export const ChatPanel = React.forwardRef<ChatPanelHandle, ChatPanelProps>(
  function ChatPanel(
    {
      conversationId,
      initialMessages,
      modelId,
      models,
      onMessagesChange,
    },
    ref,
  ) {
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

    React.useImperativeHandle(
      ref,
      () => ({
        send: (text: string) => {
          if (!text.trim() || isStreaming) return;
          sendMessage({ text });
        },
      }),
      [sendMessage, isStreaming],
    );

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

    const currentModel = models.find((m) => m.id === modelId);

    return (
      <div className="flex h-full min-h-0 flex-1 flex-col">
        {/* Messages area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <EmptyState
              modelLabel={currentModel?.label ?? modelId}
              onPick={(text) => sendMessage({ text })}
            />
          ) : (
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
                      isStreamingThis && !text
                        ? "Thinking…"
                        : text
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
          )}
        </div>

        <ChatInput
          onSubmit={(text) => sendMessage({ text })}
          onStop={stop}
          isStreaming={isStreaming}
          disabled={isStreaming}
          placeholder={`Message ${currentModel?.label ?? "the model"}…`}
        />
      </div>
    );
  },
);

function EmptyState({
  modelLabel,
  onPick,
}: {
  modelLabel: string;
  onPick: (text: string) => void;
}) {
  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-muted">
        <Bot className="size-6" />
      </div>
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Chat with {modelLabel}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask anything. Switch models anytime from the dropdown above.
        </p>
      </div>

      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-left text-sm shadow-sm transition-colors hover:bg-accent"
          >
            <Sparkles className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>{s}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
