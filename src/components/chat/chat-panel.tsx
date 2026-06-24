"use client";

import * as React from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import type { ChatMessage, ModelInfo } from "@/lib/chat/types";
import { MessageBubble, type AnyPart } from "./message-bubble";
import { ChatInput } from "./chat-input";
import { StreamingPill } from "./streaming-pill";
import { ProcessingIndicator } from "./processing-indicator";
import { fireCreditsRefresh } from "@/components/dashboard/credits-meter";
import { OpenAIConnectDialog } from "./openai-connect-dialog";

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
        p.type === "file" ||
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

type GithubAccessMode = "unknown" | "read_only" | "full";

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
  onAssistantFinish,
}: ChatPanelProps) {
  // Refs for the transport body callback.
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


  // The body callback is invoked at send-time (deferred), NOT during
  // render. Accessing .current there is safe — suppress false positive.
  /* eslint-disable react-hooks/refs */
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
  /* eslint-enable react-hooks/refs */

  // ── OpenAI connection state ──────────────────────────────────────────
  const [openaiConnected, setOpenaiConnected] = React.useState(false);
  const [showOpenAIDialog, setShowOpenAIDialog] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/openai/status")
      .then((r) => r.json())
      .then((d: { connected?: boolean }) => {
        if (d.connected) setOpenaiConnected(true);
      })
      .catch(() => {});
  }, []);

  // ── GitHub agent access state ─────────────────────────────────────────
  const [githubAccessMode, setGithubAccessMode] =
    React.useState<GithubAccessMode>("unknown");
  const [githubUsername, setGithubUsername] = React.useState<string | null>(
    null,
  );

  React.useEffect(() => {
    fetch("/api/github/status")
      .then((r) => r.json())
      .then(
        (d: {
          connected?: boolean;
          username?: string | null;
          accessMode?: "read_only" | "full";
        }) => {
          setGithubAccessMode(
            d.accessMode ?? (d.connected ? "full" : "read_only"),
          );
          setGithubUsername(d.username ?? null);
        },
      )
      .catch(() => {});
  }, []);

  const { messages, setMessages, sendMessage, status, stop, error } = useChat({
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
    experimental_throttle: agentMode ? 80 : 250,
  });

  const isStreaming = status === "submitted" || status === "streaming";

  // ── Background processing polling ──────────────────────────────────
  // When we restore a conversation that has initialMessages (from DB),
  // check if the server is still processing and poll for new messages.
  // Client gives up after MAX_POLL_MS to avoid polling forever.
  const [isServerProcessing, setIsServerProcessing] = React.useState(false);
  const isRestoredConversation = initialMessages.length > 0;
  const pollIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const lastMsgCountRef = React.useRef(initialMessages.length);

  /** Stop polling and reload messages from DB (server may have saved partial work). */
  const stopPollingAndReload = React.useCallback(async () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setIsServerProcessing(false);

    // Always reload messages — even if the server crashed, it may have
    // saved partial output (e.g. some tool calls completed).
    try {
      const convRes = await fetch(
        `/api/conversations/${conversationId}`,
        { cache: "no-store" },
      );
      if (convRes.ok) {
        const convJson = (await convRes.json()) as {
          conversation?: { messages: ChatMessage[] };
        };
        if (convJson.conversation?.messages) {
          const fresh = toUIMessages(convJson.conversation.messages);
          setMessages(fresh);
          lastMsgCountRef.current = convJson.conversation.messages.length;
          fireCreditsRefresh();
          onAssistantFinish?.();
        }
      }
    } catch {
      // reload failure is non-fatal
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Start polling when this is a restored conversation
  React.useEffect(() => {
    if (!isRestoredConversation) return;

    let cancelled = false;

    // Max polling duration: 6 minutes (matches server stale threshold).
    // Server functions can run up to 5 min (maxDuration=300), so we wait
    // a bit longer before assuming the server died.
    const MAX_POLL_MS = 6 * 60 * 1000;
    let pollStartedAt: number | null = null;

    async function checkStatus() {
      try {
        const res = await fetch(
          `/api/conversations/${conversationId}/status`,
          { cache: "no-store" },
        );
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as {
          status: string;
          messageCount: number;
        };

        if (json.status === "processing") {
          setIsServerProcessing(true);
          pollStartedAt = Date.now();

          // Start polling if not already
          if (!pollIntervalRef.current) {
            pollIntervalRef.current = setInterval(async () => {
              // Check client-side timeout
              if (pollStartedAt && Date.now() - pollStartedAt > MAX_POLL_MS) {
                console.log("[poll] Client-side timeout reached, stopping");
                await stopPollingAndReload();
                return;
              }

              try {
                const pollRes = await fetch(
                  `/api/conversations/${conversationId}/status`,
                  { cache: "no-store" },
                );
                if (!pollRes.ok) return;
                const pollJson = (await pollRes.json()) as {
                  status: string;
                  messageCount: number;
                };

                // Server finished (status=idle) or new messages arrived
                if (
                  pollJson.status === "idle" ||
                  pollJson.messageCount > lastMsgCountRef.current
                ) {
                  await stopPollingAndReload();
                }
              } catch {
                // polling errors are non-fatal
              }
            }, 3000);
          }
        } else {
          // Not processing — but check if there are new messages
          // (server may have finished just before we started polling)
          if (json.messageCount > lastMsgCountRef.current) {
            await stopPollingAndReload();
          }
        }
      } catch {
        // initial check failure — non-fatal
      }
    }

    checkStatus();

    return () => {
      cancelled = true;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [conversationId, isRestoredConversation, stopPollingAndReload]);

  const [streamStartedAt, setStreamStartedAt] = React.useState<number | null>(
    null,
  );
  // Sync streaming status → streamStartedAt. Legitimate sync with
  // external system (useChat streaming flag).
  /* eslint-disable react-hooks/set-state-in-effect */
  React.useEffect(() => {
    if (isStreaming && streamStartedAt === null) {
      setStreamStartedAt(Date.now());
    } else if (!isStreaming && streamStartedAt !== null) {
      setStreamStartedAt(null);
    }
  }, [isStreaming, streamStartedAt]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const hasMessages = messages.length > 0;

  /**
   * In **chat mode**, hide the in-progress assistant message and show the
   * StreamingPill instead — its raw streaming text would lag the browser.
   *
   * In **agent mode**, the assistant message is shown live so the user
   * can watch tool calls execute (read_file, write_file, etc.). Tool
   * panels are individually memoized so this is cheap.
   */
  const handleToolActionPrompt = React.useCallback(
    (text: string) => {
      if (!text.trim() || isStreaming) return;
      sendMessage({ text });
    },
    [isStreaming, sendMessage],
  );

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

  function handleSubmit(
    text: string,
    file?: { mediaType: string; base64: string; name: string } | null,
  ) {
    if ((!text.trim() && !file) || isStreaming) return;

    if (file) {
      sendMessage({
        text,
        files: [
          {
            type: "file",
            mediaType: file.mediaType,
            url: file.base64,
            filename: file.name,
          },
        ],
      });
    } else {
      sendMessage({ text });
    }
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
    openaiConnected,
    githubAccessMode,
    githubUsername,
    onConnectOpenAI: () => setShowOpenAIDialog(true),
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
                      onToolActionPrompt={handleToolActionPrompt}
                    />
                  );
                }
                return (
                  <MessageBubble
                    key={m.id}
                    role={m.role as ChatMessage["role"]}
                    parts={m.parts as AnyPart[]}
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

              {/* Background processing indicator — shown when conversation
                  was restored from DB and server is still working */}
              {isServerProcessing && !isStreaming && <ProcessingIndicator />}

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
          <div className="shrink-0 pb-20 sm:pb-8" />
        </div>
      )}

      {/* OpenAI Connect Dialog */}
      <OpenAIConnectDialog
        open={showOpenAIDialog}
        onClose={() => setShowOpenAIDialog(false)}
        onConnected={() => setOpenaiConnected(true)}
      />
    </div>
  );
}
