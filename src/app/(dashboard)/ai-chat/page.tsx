"use client";

import * as React from "react";
import { ConversationList } from "@/components/chat/conversation-list";
import { ChatPanel } from "@/components/chat/chat-panel";
import { newId } from "@/lib/chat/storage";
import type { ChatMessage, Conversation, ModelInfo } from "@/lib/chat/types";
import { defaultModelId, defaultModels } from "@/lib/chat/models";

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
    <div className="-mx-4 -my-6 flex h-[calc(100vh-5rem)] sm:-mx-6 lg:-mx-8">
      <aside className="hidden w-72 shrink-0 border-r border-border bg-card md:flex md:flex-col">
        <ConversationList
          items={conversations}
          activeId={active.conversationId}
          onSelect={openChat}
          onNew={startNewChat}
          onDelete={removeChat}
        />
      </aside>

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
