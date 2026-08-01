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
import { resolveActions, type AgentCompletionState } from "@/lib/agent/action-registry";
import { AlertCircle, ArrowDown, ArrowUpRight, Clock3, CornerDownRight, Gauge, GitBranch, RefreshCcw, WifiOff } from "lucide-react";
import Link from "next/link";
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
  /** Omitted when retrying cannot possibly help, e.g. an exhausted quota. */
  action?: string;
  /** When set, the action navigates here instead of retrying the turn. */
  actionHref?: string;
  kind: "network" | "rate-limit" | "provider" | "credits" | "generic";
};

/** The credit snapshot the API attaches to a 402. */
type CreditsPayload = {
  tier?: "free" | "pro";
  usedToday?: number;
  dailyLimit?: number;
  remaining?: number;
  resetsAt?: number;
};

/**
 * Pull the structured payload out of an API error.
 *
 * The chat route answers an exhausted quota with 402 and
 * `{ code: "out_of_credits", credits: {...} }`, but the transport hands us only
 * an Error, so the body arrives as text if at all. Read the real fields when
 * they survive; the caller still recognises the case without them.
 */
function parseErrorPayload(message: string): { code?: string; credits?: CreditsPayload } {
  const start = message.indexOf("{");
  const end = message.lastIndexOf("}");
  if (start < 0 || end <= start) return {};
  try {
    const parsed = JSON.parse(message.slice(start, end + 1)) as {
      code?: string;
      credits?: CreditsPayload;
    };
    return { code: parsed.code, credits: parsed.credits };
  } catch {
    return {};
  }
}

function formatResetTime(resetsAt?: number): string {
  if (!resetsAt || !Number.isFinite(resetsAt)) return "tengah malam UTC";
  try {
    // The user's own clock, not UTC — "midnight UTC" means 07.00 in Jakarta and
    // something else again elsewhere.
    return new Date(resetsAt).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "tengah malam UTC";
  }
}

function getRecoveryError(error: Error): RecoveryError {
  const message = error.message.toLowerCase();
  const { code, credits } = parseErrorPayload(error.message);

  // Credits FIRST, and before the rate-limit branch on purpose. The server
  // message is "Daily credit limit reached (50/50). Resets at midnight UTC.",
  // which contains "limit reached" — so it used to land in the rate-limit case
  // and tell the user a provider was throttling them and to wait a moment.
  // Both halves were wrong: nothing was throttled, and waiting never helps
  // because the quota resets on a schedule.
  if (code === "out_of_credits" || message.includes("credit limit")) {
    const used = credits?.usedToday;
    const limit = credits?.dailyLimit;
    // Usage can read past the cap (e.g. 54/50): a turn reserves its base cost
    // up front and settles the real one — base + tool calls — afterwards, and
    // the tool count is unknowable before the turn runs.
    const usage = typeof used === "number" && typeof limit === "number" ? ` (${used}/${limit})` : "";
    const isPro = credits?.tier === "pro";
    const tierName = isPro ? "Pro" : "Free";
    const resetAt = formatResetTime(credits?.resetsAt);
    return {
      title: "Kredit harian habis",
      description: isPro
        ? `Kuota kredit ${tierName} harian Anda telah mencapai batas${usage}. Kuota diperbarui pukul ${resetAt}.`
        : `Kuota kredit ${tierName} harian Anda telah mencapai batas${usage}. Kuota diperbarui pukul ${resetAt}, atau upgrade ke Pro untuk melanjutkan sekarang.`,
      action: isPro ? "Kelola langganan" : "Upgrade ke Pro",
      actionHref: "/subscription",
      kind: "credits",
    };
  }

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
  // "limit reached" used to be in this list and was the whole bug: it matches
  // far more than provider throttling. The route's own rate-limit error says
  // "Model provider rate limit reached…", so "rate limit" already covers it.
  if (
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("rate-limit") ||
    message.includes("too many requests")
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
  return stored.map((m) => {
    // Assistant messages saved by the client carry full UIMessage parts
    // (text + tool calls + tool results) — restore them so the action
    // timeline re-renders on reload. Legacy rows / user messages fall back
    // to a single text part from `content`.
    const hasRealParts =
      Array.isArray(m.parts) && m.parts.length > 0;
    return {
      id: m.id,
      role: m.role,
      parts: hasRealParts
        ? (m.parts as UIMessage["parts"])
        : [{ type: "text" as const, text: m.content }],
      // Restore metadata (agentState) so context-aware Quick Actions survive
      // reload. Null/legacy → undefined, UI uses generic fallback.
      metadata: m.metadata ?? undefined,
    };
  });
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
  /** Project folder id this chat is filed under (or will be filed under
   *  for a new chat). Forwarded to /api/chat as body.projectId. */
  projectId: string | null;
  onProjectIdChange: (next: string | null) => void;
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
  projectId,
  // onProjectIdChange is owned by the parent page (project selector lives in
  // the header, not the composer), so it's intentionally not destructured here.
  agentMode,
  onAssistantFinish,
}: ChatPanelProps) {
  // Refs for the transport body callback.
  const modelIdRef = React.useRef(modelId);
  const webSearchRef = React.useRef(webSearch);
  const conversationIdRef = React.useRef(conversationId);
  const repoRef = React.useRef(repo);
  const projectIdRef = React.useRef(projectId);
  // Mirror of the latest `messages` from useChat, read inside onFinish where
  // the closure would otherwise be stale. Used to persist the assistant
  // message (with full parts) to the server after the stream finishes.
  const messagesStateRef = React.useRef<UIMessage[]>(toUIMessages(initialMessages));
  // Avoid double-saving the same final assistant message across re-renders.
  const savedAssistantIdsRef = React.useRef<Set<string>>(new Set());
  // True once this session has actually streamed a response. On a fresh page
  // load/hydration the chat starts already "ready" with messages from the DB;
  // we must NOT re-save those. Only persist after a real stream happened.
  const didStreamThisSessionRef = React.useRef(false);


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
    projectIdRef.current = projectId;
  }, [projectId]);


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
          projectId: projectIdRef.current,
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
    // Agent turns run detached on the server, so closing the tab no longer
    // stops them. On mount we probe GET /api/chat/<id>/stream: if a turn for
    // this conversation is still in flight we reattach and the timeline picks
    // up where it left off (204 = nothing running, the common case).
    resume: true,
    // In agent mode the user wants to SEE tool calls happen in real time.
    // In chat mode the streaming text is hidden behind a pill so we can
    // throttle aggressively. Pick the rate at construction time.
    experimental_throttle: agentMode ? 80 : 250,
  });

  // Keep the messages mirror ref in sync every render.
  messagesStateRef.current = messages;

  // Mark that a real stream happened this session (submitted/streaming).
  // Hydration starts "ready" with DB messages — this stays false then, so the
  // save effect below won't re-persist already-stored messages.
  React.useEffect(() => {
    if (status === "submitted" || status === "streaming") {
      didStreamThisSessionRef.current = true;
    }
  }, [status]);

  // After a turn finishes, persist the final assistant message (with full
  // parts: text + tool calls + tool results) so the action timeline survives
  // a reload. Only run after a real stream — never on hydration/reload.
  const streamDone = status === "ready" || status === "error";
  React.useEffect(() => {
    if (!streamDone) return;
    if (!didStreamThisSessionRef.current) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    if (savedAssistantIdsRef.current.has(last.id)) return;
    savedAssistantIdsRef.current.add(last.id);

    const text = partsToText(last.parts);
    console.log("[chat] persist assistant", {
      conversationId,
      clientId: last.id,
      contentLen: text.length,
      partsLen: last.parts?.length,
    });
    void fetch(`/api/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: "assistant",
        content: text,
        parts: last.parts,
        clientId: last.id,
        metadata: last.metadata ?? null,
      }),
    })
      .then((res) =>
        console.log("[chat] persist assistant response", res.status),
      )
      .catch((err) => {
        console.error("[chat] failed to persist assistant parts:", err);
        // allow retry on a future render if the save failed
        savedAssistantIdsRef.current.delete(last.id);
      });
  }, [streamDone, messages, conversationId]);

  const isStreaming = status === "submitted" || status === "streaming";
  // Mirrored into a ref so the status poller (below) can tell whether a live
  // stream is attached without re-creating its callbacks on every tick.
  const isStreamingRef = React.useRef(false);
  React.useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);
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

    // If we managed to reattach to the live run, that stream is the better
    // source — reloading from the database here would replace the streaming
    // message mid-flight.
    if (isStreamingRef.current) return;

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

  // Once the response stream opens, the send succeeded — the run continues
  // detached on the server even if the stream later drops (mobile networks).
  // A mid-stream error must not restore the sent text into the composer.
  React.useEffect(() => {
    if (status === "streaming") lastSubmittedTextRef.current = "";
  }, [status]);

  const fillComposer = React.useCallback((suggestion: string) => {
    setDraft(suggestion);
    setFocusRequestKey((key) => key + 1);
  }, []);

  // ── PRD → Agent handoff ─────────────────────────────────────────────
  // The PRD generator stores a pending composer draft (keyed to ITS
  // conversation) and navigates here. The ai-chat page restores that
  // conversation and remounts this panel; only the panel whose id matches
  // consumes the draft — the transient fresh panel that mounts first must
  // not eat it.
  const [prdBuildPending, setPrdBuildPending] = React.useState(false);
  React.useEffect(() => {
    let timeout: number | undefined;
    try {
      const raw = localStorage.getItem("celiuz:pendingComposerDraft");
      if (!raw) return;
      const pending = JSON.parse(raw) as { conversationId?: string; text?: string };
      if (pending.conversationId !== conversationId || !pending.text) return;
      localStorage.removeItem("celiuz:pendingComposerDraft");
      const text = pending.text;
      // If this exact instruction is already in the transcript (the user
      // tapped "Buat di Chat" again while the agent was working), navigating
      // back here must not refill the composer with an already-sent prompt.
      const alreadySent = messagesStateRef.current.some(
        (message) =>
          message.role === "user" &&
          partsToText(message.parts).trim() === text.trim(),
      );
      if (alreadySent) return;
      // Deferred a tick — same convention as the LS conversation restore.
      timeout = window.setTimeout(() => {
        fillComposer(text);
        setPrdBuildPending(true);
      }, 0);
    } catch {
      // Malformed handoff state is not worth surfacing.
    }
    return () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [conversationId, fillComposer]);

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

  // Context-aware Quick Actions: read the orchestrator-validated AgentState
  // from the last assistant message's metadata and resolve the follow-ups it
  // carries. No hardcoded buttons: the state supplies planner offers or
  // generated suggestions, and the registry is only a last resort.
  const lastVisibleMessage = visibleMessages[visibleMessages.length - 1];
  const followUpActions = React.useMemo(() => {
    const meta = lastVisibleMessage?.metadata as
      | { agentState?: AgentCompletionState }
      | undefined;
    return resolveActions(meta?.agentState);
  }, [lastVisibleMessage?.metadata]);

  // No chips when there is nothing worth offering — resolveActions returns []
  // rather than padding with filler, and an empty row would just be noise.
  const showFollowUps =
    !isStreaming &&
    !error &&
    lastVisibleMessage?.role === "assistant" &&
    followUpActions.length > 0;
  const recoveryError = error ? getRecoveryError(error) : null;
  const RecoveryIcon =
    recoveryError?.kind === "network"
      ? WifiOff
      : recoveryError?.kind === "rate-limit"
        ? Clock3
        : recoveryError?.kind === "credits"
          ? Gauge
          : AlertCircle;

  const retryFailedTurn = React.useCallback(() => {
    if (isStreaming) return;
    clearError();
    void regenerate();
  }, [clearError, isStreaming, regenerate]);

  // Stopping has two halves now: detach this client (stop) and kill the
  // detached server run (DELETE). Without the second, the agent would keep
  // working — and keep spending credits — after the user pressed stop.
  const handleStop = React.useCallback(() => {
    stop();
    void fetch(`/api/chat/${conversationId}/stream`, { method: "DELETE" }).catch(
      (err) => console.error("[chat] failed to stop server run:", err),
    );
  }, [stop, conversationId]);

  // Placeholder bergantung state percakapan: sapaan pembuka saat kosong,
  // ajakan lanjutan setelah ada pesan. ChatInput punya prop placeholder
  // tapi selama ini tidak pernah dioper — selalu default.
  const composerPlaceholder = hasMessages
    ? "Tanya lanjutan…"
    : "Tanya apa saja atau jelaskan tugas Anda…";

  const inputProps = {
    onSubmit: handleSubmit,
    onStop: handleStop,
    isStreaming,
    disabled: isStreaming,
    placeholder: composerPlaceholder,
    models,
    modelId,
    onModelChange,
    webSearch,
    onWebSearchChange,
    repo,
    onRepoChange,
    agentMode,
    draft,
    onDraftChange: setDraft,
    focusRequestKey,
  } as const;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {hasMessages ? (
        <>
          <div ref={scrollRef} className="relative flex-1 overflow-y-auto overscroll-contain">
            <div ref={messagesRef} className="mx-auto w-full max-w-3xl px-4 pb-4 pt-4 sm:px-6">
              {visibleMessages.map((m) => {
                const isLast =
                  m.id === messages[messages.length - 1]?.id;
                const isStreamingThis =
                  isStreaming && isLast && m.role === "assistant";
                if (m.role === "assistant") {
                  const meta = m.metadata as
                    | { agentState?: AgentCompletionState; durationMs?: number }
                    | undefined;
                  return (
                    <MessageBubble
                      key={m.id}
                      role="assistant"
                      parts={toBubbleParts(m.parts)}
                      streaming={isStreamingThis}
                      durationMs={
                        typeof meta?.durationMs === "number" ? meta.durationMs : undefined
                      }
                      taskType={meta?.agentState?.taskType}
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
                  />
                )}

              {/* Follow-up suggestions: quiet text rows, not boxed chips —
                  they should read like a whispered "you could…" under the
                  reply, not compete with the message itself. Tapping sends the
                  action's own self-contained message, not the short label. */}
              {showFollowUps && (
                <div className="mt-2 flex flex-col items-start pl-2 sm:pl-12" aria-label="Saran lanjutan">
                  <span className="px-1.5 pb-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
                    Saran lanjutan
                  </span>
                  {followUpActions.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => handleToolActionPrompt(action.message)}
                      className="group flex max-w-full items-start gap-2 rounded-md px-1.5 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <CornerDownRight className="mt-0.5 size-3.5 shrink-0 opacity-50 transition-opacity group-hover:opacity-100" />
                      <span className="whitespace-normal break-words leading-snug">{action.label}</span>
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
                    {/* An exhausted quota cannot be retried, so that case sends
                        the user somewhere that can actually resolve it instead
                        of inviting the same failure again. */}
                    {recoveryError.action && recoveryError.actionHref ? (
                      <Link
                        href={recoveryError.actionHref}
                        className="mt-2 inline-flex h-8 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {recoveryError.action}
                        <ArrowUpRight className="size-3.5" aria-hidden="true" />
                      </Link>
                    ) : recoveryError.action ? (
                      <button
                        type="button"
                        onClick={retryFailedTurn}
                        disabled={isStreaming}
                        className="mt-2 inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                      >
                        <RefreshCcw className="size-3.5" aria-hidden="true" />
                        {recoveryError.action}
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* relative, not sticky: a flex sibling of the scroller already sits outside the scroll flow. No touch-action: the root lock in globals.css handles the URL bar, and touch-action:none here also broke the textarea's own scrolling on long drafts. pb-1 rather than py-3: main supplies most of the bottom inset, and the focus ring is thinned to 1px at 2px offset in chat-input, so it only reaches ~2px past the card. The page section clips anything below this wrapper, so keep enough room for that overhang -- pb-0 sheared the ring's whole bottom stroke off. */}
          <div ref={composerRef} className="relative z-10 shrink-0 bg-background px-4 pb-1 pt-3">
            {/* Messages fade out into the top of the composer — content vanishes
                partway down rather than hitting a hard line or bleeding past. */}
            <div className="pointer-events-none absolute inset-x-0 -top-10 h-16 bg-gradient-to-b from-transparent via-background/60 to-background" aria-hidden="true" />
            {showScrollToLatest && (
              <button
                type="button"
                aria-label="Scroll to latest message"
                onClick={() => scrollToLatest("smooth")}
                className="absolute -top-14 left-1/2 z-20 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-md transition-colors hover:bg-muted"
              >
                <ArrowDown className="size-4" />
              </button>
            )}
            <div className="relative">
              {/* PRD build handoff needs a repo before the agent can write code. */}
              {prdBuildPending && !repo && (
                <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  <GitBranch className="size-3.5 shrink-0" />
                  <span>
                    Pilih repo tujuan lewat tombol{" "}
                    <span className="font-semibold text-foreground">Repo</span> di
                    composer supaya agent bisa menulis kode dari PRD ini.
                  </span>
                </div>
              )}
              <ChatInput {...inputProps} />
            </div>
          </div>
        </>
      ) : (
        <div className="flex h-full flex-col overflow-y-auto overscroll-contain px-4">
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

            {/* Agent-mode onboarding — the strongest feature was invisible
                unless you already knew the little Repo control existed. */}
            {!repo && githubAccessMode === "read_only" && (
              <a
                href="/api/github/install"
                className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <GitBranch className="size-3.5 shrink-0" />
                <span>
                  <span className="font-semibold text-foreground">Mode Agent:</span>{" "}
                  install GitHub App agar AI bisa membaca &amp; menulis kode di repo Anda →
                </span>
              </a>
            )}
            {!repo && githubAccessMode === "full" && (
              <p className="text-center text-xs text-muted-foreground">
                {githubUsername ? (
                  <>GitHub <span className="font-mono">@{githubUsername}</span> terhubung — </>
                ) : (
                  <>GitHub terhubung — </>
                )}
                pilih repo lewat tombol <span className="font-semibold">Repo</span> di
                composer untuk mengaktifkan Mode Agent.
              </p>
            )}
          </div>
          {/* Mirror the top spacer so the greeting sits centered, not sunk
              to the bottom of the viewport. */}
          <div className="flex-1 shrink-0 pb-20 sm:pb-8" />
        </div>
      )}
    </div>
  );
}
