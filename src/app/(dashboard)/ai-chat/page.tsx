"use client";

import * as React from "react";
import { ChatPanel } from "@/components/chat/chat-panel";
import { newId } from "@/lib/chat/storage";
import type { ChatMessage, Conversation, ModelInfo } from "@/lib/chat/types";
import { defaultModelId, defaultModels } from "@/lib/chat/models";
import {
  Plus,
  History,
  MessageSquare,
  Trash2,
  ChevronDown,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ActivePanel = {
  /** UUID used as both React key AND the conversationId sent to /api/chat. */
  conversationId: string;
  initialMessages: ChatMessage[];
};

function freshPanel(): ActivePanel {
  return { conversationId: newId(), initialMessages: [] };
}

export default function AIChatPage() {
  const [models, setModels] = React.useState<ModelInfo[]>(defaultModels);
  const [modelId, setModelId] = React.useState<string>(defaultModelId);
  const [webSearch, setWebSearch] = React.useState<boolean>(false);
  const [repo, setRepo] = React.useState<string | null>(null);
  const [agentMode, setAgentMode] = React.useState<boolean>(false);

  // Auto-disable agent mode if the user disconnects the repo — agent
  // mode is meaningless without one.
  React.useEffect(() => {
    if (!repo && agentMode) setAgentMode(false);
  }, [repo, agentMode]);

  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [active, setActive] = React.useState<ActivePanel>(freshPanel);
  const [historyOpen, setHistoryOpen] = React.useState(false);

  // Close history dropdown when clicking outside
  const historyRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        historyRef.current &&
        !historyRef.current.contains(e.target as Node)
      ) {
        setHistoryOpen(false);
      }
    }
    if (historyOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [historyOpen]);

  // Hydrate the sidebar with the user's conversations from Supabase.
  const reloadConversations = React.useCallback(async () => {
    try {
      const res = await fetch("/api/conversations", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { conversations?: Conversation[] };
      if (Array.isArray(json.conversations)) {
        setConversations(json.conversations);
      }
    } catch {
      // network errors are non-fatal — just leave the previous list
    }
  }, []);

  React.useEffect(() => {
    reloadConversations();
  }, [reloadConversations]);

  // Fetch the live model list.
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/models")
      .then((r) => r.json())
      .then((json: { models?: ModelInfo[] }) => {
        if (cancelled) return;
        if (Array.isArray(json.models) && json.models.length > 0) {
          setModels(json.models);
          if (!json.models.some((m) => m.id === modelId)) {
            setModelId(json.models[0].id);
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startNewChat() {
    setActive(freshPanel());
    setHistoryOpen(false);
  }

  async function openChat(id: string) {
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = (await res.json()) as { conversation?: Conversation };
      const conv = json.conversation;
      if (!conv) return;
      if (conv.modelId) setModelId(conv.modelId);
      setRepo(conv.githubRepo ?? null);
      setActive({
        conversationId: conv.id,
        initialMessages: conv.messages,
      });
      setHistoryOpen(false);
    } catch {
      // ignore network error
    }
  }

  async function removeChat(id: string) {
    try {
      await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    } catch {
      // ignore
    }
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (active.conversationId === id) {
      setActive(freshPanel());
    }
  }

  // Refresh the list each time an assistant response finishes streaming —
  // that's when a new conversation row may have appeared or an existing
  // one's updated_at moved.
  const handleAssistantFinish = React.useCallback(() => {
    reloadConversations();
  }, [reloadConversations]);

  return (
    <div className="-mx-4 -my-6 flex h-[calc(100vh-5rem)] flex-col sm:-mx-6 lg:-mx-8">
      {/* ── Top bar: New Chat + History toggle ── */}
      <div className="relative z-[60] flex items-center gap-2 border-b border-border bg-card/80 px-4 py-2 backdrop-blur-md">
        <button
          onClick={startNewChat}
          className="flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:opacity-90"
        >
          <Plus className="size-4" />
          New chat
        </button>

        <div ref={historyRef} className="relative">
          <button
            onClick={() => setHistoryOpen((prev) => !prev)}
            className={cn(
              "flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors",
              historyOpen
                ? "bg-accent text-accent-foreground"
                : "bg-background text-foreground hover:bg-accent/60",
            )}
          >
            <History className="size-4" />
            History
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform",
                historyOpen && "rotate-180",
              )}
            />
          </button>

          {/* ── Dropdown panel ── */}
          {historyOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 w-80 rounded-xl border border-border bg-card shadow-xl">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <span className="text-sm font-semibold">
                  Conversations ({conversations.length})
                </span>
                <button
                  onClick={() => setHistoryOpen(false)}
                  className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto p-2">
                {conversations.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                    No conversations yet.
                    <br />
                    Start chatting to begin.
                  </p>
                ) : (
                  <div className="space-y-0.5">
                    {conversations.map((conv) => {
                      const isActive = conv.id === active.conversationId;
                      return (
                        <div
                          key={conv.id}
                          className={cn(
                            "group flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors",
                            isActive
                              ? "bg-accent text-accent-foreground"
                              : "hover:bg-accent/60",
                          )}
                        >
                          <button
                            onClick={() => openChat(conv.id)}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">{conv.title}</span>
                          </button>
                          <button
                            onClick={() => removeChat(conv.id)}
                            aria-label="Delete conversation"
                            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-red-500 group-hover:opacity-100"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Chat area (full width, no sidebar) ── */}
      <section className="flex min-w-0 flex-1 flex-col">
        <ChatPanel
          key={active.conversationId}
          conversationId={active.conversationId}
          initialMessages={active.initialMessages}
          modelId={modelId}
          models={models}
          onModelChange={setModelId}
          webSearch={webSearch}
          onWebSearchChange={setWebSearch}
          repo={repo}
          onRepoChange={setRepo}
          agentMode={agentMode}
          onAgentModeChange={setAgentMode}
          onAssistantFinish={handleAssistantFinish}
        />
      </section>
    </div>
  );
}
