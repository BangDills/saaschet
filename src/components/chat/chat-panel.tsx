"use client";

import * as React from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import type { ChatMessage, ModelInfo } from "@/lib/chat/types";
import {
  MessageBubble,
  type AnyPart,
  type MessageFeedback,
} from "./message-bubble";
import { ChatInput } from "./chat-input";
import { StreamingPill } from "./streaming-pill";
import { ProcessingIndicator } from "./processing-indicator";
import { fireCreditsRefresh } from "@/components/dashboard/credits-meter";
import { AlertCircle, ArrowDown, Clock3, RefreshCcw, WifiOff } from "lucide-react";
import useSWR from "swr";

type FeedbackResponse = {
  feedback: Array<MessageFeedback & { messageId: string }>;
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const json = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(json.error || "Request failed");
  return json;
}

type RecoveryError = {
  title: string;
  description: string;
  action: string;
  kind: "network" | "rate-limit" | "provider" | "generic";
};

function getRecoveryError(error: Error): RecoveryError {
  const message = error.message.toLowerCase();
  if (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("connection") ||
    message.includes("offline")
  ) {
    return {
      title: "Koneksi terputus",
      description: "Periksa koneksi internet Anda. Pesan terakhir tetap aman dan dapat dicoba kembali.",
      action: "Coba lagi",
      kind: "network",
    };
  }
  if (
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("quota") ||
    message.includes("limit reached")
  ) {
    return {
      title: "Batas model tercapai",
      description: "Provider sedang membatasi permintaan. Tunggu sebentar, lalu coba respons ini lagi.",
      action: "Coba lagi",
      kind: "rate-limit",
    };
  }
  if (
    message.includes("provider") ||
    message.includes("inference") ||
    message.includes("api key") ||
    message.includes("temporarily unavailable")
  ) {
    return {
      title: "Model tidak dapat merespons",
      description: "Provider model sedang bermasalah. Anda dapat mencoba lagi tanpa mengirim ulang pesan.",
      action: "Ulangi respons",
      kind: "provider",
    };
  }
  return {
    title: "Respons gagal dibuat",
    description: error.message || "Terjadi kendala saat membuat respons. Silakan coba lagi.",
    action: "Coba lagi",
    kind: "generic",
  };
}

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

  const {
    messages,
    setMessages,
    sendMessage,
    regenerate,
    clearError,
    status,
    stop,
    error,
  } = useChat({
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
  const feedbackUrl = `/api/conversations/${conversationId}/feedback`;
  const { data: feedbackData, mutate: mutateFeedback } = useSWR<FeedbackResponse>(
    messages.some((message) => message.role === "assistant") ? feedbackUrl : null,
    fetchJson,
    { revalidateOnFocus: false },
  );
  const [pendingFeedbackIds, setPendingFeedbackIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [feedbackErrors, setFeedbackErrors] = React.useState<
    Record<string, string | null>
  >({});

  const feedbackByMessage = React.useMemo(
    () =>
      Object.fromEntries(
        (feedbackData?.feedback ?? []).map(({ messageId, rating, reason }) => [
          messageId,
          { rating, reason },
        ]),
      ) as Record<string, MessageFeedback>,
    [feedbackData],
  );

  const updateFeedback = React.useCallback(
    async (
      messageId: string,
      rating: MessageFeedback["rating"] | null,
      reason?: string | null,
    ) => {
      setPendingFeedbackIds((current) => new Set(current).add(messageId));
      setFeedbackErrors((current) => ({ ...current, [messageId]: null }));

      const previous = feedbackData;
      const nextItems = (previous?.feedback ?? []).filter(
        (item) => item.messageId !== messageId,
      );
      if (rating) nextItems.push({ messageId, rating, reason: reason ?? null });
      await mutateFeedback({ feedback: nextItems }, { revalidate: false });

      try {
        const response = await fetch(feedbackUrl, {
          method: rating ? "PUT" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId, rating, reason }),
        });
        const json = (await response.json()) as {
          error?: string;
          feedback?: MessageFeedback & { messageId: string };
          messageId?: string;
        };
        if (!response.ok) throw new Error(json.error || "Feedback gagal disimpan");

        const persistedId = json.feedback?.messageId ?? json.messageId ?? messageId;
        const persistedItems = nextItems.filter(
          (item) => item.messageId !== messageId && item.messageId !== persistedId,
        );
        if (rating) {
          const persisted = {
            messageId: persistedId,
            rating,
            reason: reason ?? null,
          };
          persistedItems.push(persisted);
          if (persistedId !== messageId) {
            persistedItems.push({ ...persisted, messageId });
          }
        }
        await mutateFeedback({ feedback: persistedItems }, { revalidate: false });
      } catch (feedbackError) {
        await mutateFeedback(previous, { revalidate: false });
        setFeedbackErrors((current) => ({
          ...current,
          [messageId]:
            feedbackError instanceof Error
              ? feedbackError.message
              : "Feedback gagal disimpan",
        }));
      } finally {
        setPendingFeedbackIds((current) => {
          const next = new Set(current);
          next.delete(messageId);
          return next;
        });
      }
    },
    [feedbackData, feedbackUrl, mutateFeedback],
  );

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
  const messagesRef = React.useRef<HTMLDivElement>(null);
  const composerRef = React.useRef<HTMLDivElement>(null);
  const isNearBottomRef = React.useRef(true);
  const isScrollingToLatestRef = React.useRef(false);
  const scrollFrameRef = React.useRef<number | null>(null);
  const [showScrollToLatest, setShowScrollToLatest] = React.useState(false);

  const updateScrollPosition = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isNearBottom = distanceFromBottom <= 120;
    if (isScrollingToLatestRef.current && !isNearBottom) return;
    if (isNearBottom) isScrollingToLatestRef.current = false;
    isNearBottomRef.current = isNearBottom;
    setShowScrollToLatest(!isNearBottom);
  }, []);

  const scrollToLatest = React.useCallback((behavior: ScrollBehavior = "auto") => {
    const el = scrollRef.current;
    if (!el) return;
    isNearBottomRef.current = true;
    isScrollingToLatestRef.current = behavior === "smooth";
    setShowScrollToLatest(false);
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior });
      scrollFrameRef.current = null;
    });
  }, []);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollPosition();
    el.addEventListener("scroll", updateScrollPosition, { passive: true });
    return () => el.removeEventListener("scroll", updateScrollPosition);
  }, [updateScrollPosition]);

  React.useEffect(() => {
    const messagesEl = messagesRef.current;
    const composerEl = composerRef.current;
    if (!messagesEl || !composerEl) return;

    const observer = new ResizeObserver(() => {
      if (isNearBottomRef.current) scrollToLatest();
      else updateScrollPosition();
    });
    observer.observe(messagesEl);
    observer.observe(composerEl);
    return () => observer.disconnect();
  }, [scrollToLatest, updateScrollPosition]);

  React.useEffect(() => {
    if (isNearBottomRef.current) scrollToLatest();
  }, [conversationId, visibleMessages.length, isStreaming, scrollToLatest]);

  React.useEffect(
    () => () => {
      if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    },
    [],
  );

  const lastSubmittedTextRef = React.useRef("");

  function handleSubmit(
    text: string,
    file?: { mediaType: string; base64: string; name: string } | null,
  ) {
    if ((!text.trim() && !file) || isStreaming) return;

    lastSubmittedTextRef.current = text;
    isNearBottomRef.current = true;
    setShowScrollToLatest(false);

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

  // The composer draft lives here so starter and follow-up prompts can fill it
  // without sending immediately or losing the text when the layout changes.
  const [draft, setDraft] = React.useState("");
  const [focusRequestKey, setFocusRequestKey] = React.useState(0);

  // Restore only an empty composer after a failed send; never overwrite edits
  // the user made while the request was in flight.
  React.useEffect(() => {
    if (!error || !lastSubmittedTextRef.current) return;
    setDraft((current) => current || lastSubmittedTextRef.current);
  }, [error]);

  const fillComposer = React.useCallback((suggestion: string) => {
    setDraft(suggestion);
    setFocusRequestKey((key) => key + 1);
  }, []);

  const starterSuggestions = React.useMemo(() => {
    if (repo && agentMode) {
      return [
        `Tinjau kode di ${repo}`,
        `Temukan dan perbaiki bug di ${repo}`,
        `Buat rencana perubahan untuk ${repo}`,
      ];
    }
    if (repo) {
      return [
        `Jelaskan arsitektur ${repo}`,
        `Temukan potensi masalah di ${repo}`,
        `Ringkas isi repository ${repo}`,
      ];
    }
    if (agentMode) {
      return [
        "Bantu saya merencanakan fitur baru",
        "Tinjau kode dan sarankan perbaikan",
        "Bantu debug sebuah masalah",
      ];
    }
    return [
      "Tinjau sebuah repository",
      "Buat landing page",
      "Bantu debug sebuah masalah",
    ];
  }, [agentMode, repo]);

  const followUpSuggestions = React.useMemo(() => {
    if (repo && agentMode) {
      return ["Terapkan perubahan ini", "Periksa dampak perubahannya", "Buatkan pengujian"];
    }
    if (repo) {
      return ["Jelaskan lebih rinci", "Tunjukkan file terkait", "Apa langkah berikutnya?"];
    }
    return ["Jelaskan lebih sederhana", "Berikan contoh", "Apa langkah berikutnya?"];
  }, [agentMode, repo]);

  const lastVisibleMessage = visibleMessages[visibleMessages.length - 1];
  const showFollowUps =
    !isStreaming && !error && lastVisibleMessage?.role === "assistant";
  const recoveryError = error ? getRecoveryError(error) : null;
  const RecoveryIcon =
    recoveryError?.kind === "network"
      ? WifiOff
      : recoveryError?.kind === "rate-limit"
        ? Clock3
        : AlertCircle;

  const retryFailedTurn = React.useCallback(() => {
    if (isStreaming) return;
    clearError();
    void regenerate();
  }, [clearError, isStreaming, regenerate]);

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
    githubAccessMode,
    githubUsername,
    draft,
    onDraftChange: setDraft,
    focusRequestKey,
  } as const;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {hasMessages ? (
        <>
          <div ref={scrollRef} className="relative flex-1 overflow-y-auto">
            <div ref={messagesRef} className="mx-auto w-full max-w-3xl px-4 pb-28 pt-4 sm:px-6">
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
                      feedback={feedbackByMessage[m.id] ?? null}
                      feedbackPending={pendingFeedbackIds.has(m.id)}
                      feedbackError={feedbackErrors[m.id] ?? null}
                      onFeedback={(rating, reason) =>
                        updateFeedback(m.id, rating, reason)
                      }
                      onRetry={
                        !isStreaming && isLast
                          ? () => {
                              clearError();
                              void regenerate({ messageId: m.id });
                            }
                          : undefined
                      }
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
                    requestStatus={status === "submitted" ? "submitted" : "streaming"}
                    onStop={stop}
                  />
                )}

              {showFollowUps && (
                <div className="mt-3 flex flex-wrap gap-2 pl-10 sm:pl-12" aria-label="Saran lanjutan">
                  {followUpSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => fillComposer(suggestion)}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}

              {/* Background processing indicator — shown when conversation
                  was restored from DB and server is still working */}
              {isServerProcessing && !isStreaming && <ProcessingIndicator />}

              {recoveryError && (
                <div
                  role="alert"
                  className="my-3 flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                    <RecoveryIcon className="size-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">
                      {recoveryError.title}
                    </p>
                    <p className="mt-0.5 text-pretty leading-5 text-muted-foreground">
                      {recoveryError.description}
                    </p>
                    <button
                      type="button"
                      onClick={retryFailedTurn}
                      disabled={isStreaming}
                      className="mt-2 inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                    >
                      <RefreshCcw className="size-3.5" aria-hidden="true" />
                      {recoveryError.action}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div ref={composerRef} className="relative shrink-0 border-t border-border/60 bg-background px-4 py-3">
            {showScrollToLatest && (
              <button
                type="button"
                aria-label="Scroll to latest message"
                onClick={() => scrollToLatest("smooth")}
                className="absolute -top-12 left-1/2 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm transition-colors hover:bg-muted"
              >
                <ArrowDown className="size-4" />
              </button>
            )}
            <ChatInput {...inputProps} />
          </div>
        </>
      ) : (
        <div className="flex h-full flex-col overflow-y-auto px-4">
          <div className="flex-1" />
          <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-5">
            <div className="text-center">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Halo!
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Ada yang bisa saya bantu hari ini?
              </p>
            </div>

            <div className="flex w-full flex-wrap justify-center gap-2 px-2">
              {starterSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => fillComposer(suggestion)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            <ChatInput variant="centered" {...inputProps} />
          </div>
          <div className="shrink-0 pb-20 sm:pb-8" />
        </div>
      )}
    </div>
  );
}
