"use client";

import * as React from "react";
import { ConversationList } from "@/components/chat/conversation-list";
import { ChatPanel } from "@/components/chat/chat-panel";
import {
  deleteConversation,
  deriveTitle,
  listConversations,
  newId,
  saveConversation,
} from "@/lib/chat/storage";
import type { ChatMessage, Conversation, ModelInfo } from "@/lib/chat/types";
import { defaultModelId, defaultModels } from "@/lib/chat/models";
import { defaultContextId } from "@/lib/chat/contexts";

type PanelInstance = {
  key: string;
  initialMessages: ChatMessage[];
};

const FRESH_PANEL: PanelInstance = { key: "new", initialMessages: [] };

export default function AIChatPage() {
  const [models, setModels] = React.useState<ModelInfo[]>(defaultModels);
  const [modelId, setModelId] = React.useState<string>(defaultModelId);
  const [contextId, setContextId] = React.useState<string>(defaultContextId);
  const [webSearch, setWebSearch] = React.useState<boolean>(false);
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [panel, setPanel] = React.useState<PanelInstance>(FRESH_PANEL);

  React.useEffect(() => {
    setConversations(listConversations());
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/models")
      .then((r) => r.json())
      .then((json: { models?: ModelInfo[] }) => {
        if (cancelled) return;
        if (Array.isArray(json.models) && json.models.length > 0) {
          setModels(json.models);
        }
      })
      .catch(() => {
        // keep defaults
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function startNewChat() {
    setActiveId(null);
    setPanel({ key: `new-${Date.now()}`, initialMessages: [] });
  }

  function openChat(id: string) {
    const conv = conversations.find((c) => c.id === id);
    if (!conv) return;
    setActiveId(id);
    if (conv.modelId) setModelId(conv.modelId);
    setPanel({ key: `c-${id}`, initialMessages: conv.messages });
  }

  function removeChat(id: string) {
    deleteConversation(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setPanel(FRESH_PANEL);
    }
  }

  function handleMessagesChange(msgs: ChatMessage[]) {
    if (msgs.length === 0) return;

    let convId = activeId;
    if (!convId) {
      convId = newId();
      setActiveId(convId);
    }

    const now = Date.now();
    setConversations((prev) => {
      const existing = prev.find((c) => c.id === convId);
      const next: Conversation = {
        id: convId!,
        title:
          existing?.title && existing.title !== "New chat"
            ? existing.title
            : deriveTitle(msgs),
        modelId,
        messages: msgs,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      saveConversation(next);
      const idx = prev.findIndex((c) => c.id === convId);
      const list =
        idx === -1
          ? [next, ...prev]
          : prev.map((c) => (c.id === convId ? next : c));
      return list.sort((a, b) => b.updatedAt - a.updatedAt);
    });
  }

  return (
    <div className="-mx-4 -my-6 flex h-[calc(100vh-5rem)] sm:-mx-6 lg:-mx-8">
      <aside className="hidden w-72 shrink-0 border-r border-border bg-card md:flex md:flex-col">
        <ConversationList
          items={conversations}
          activeId={activeId ?? undefined}
          onSelect={openChat}
          onNew={startNewChat}
          onDelete={removeChat}
        />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <ChatPanel
          key={panel.key}
          conversationId={panel.key}
          initialMessages={panel.initialMessages}
          modelId={modelId}
          models={models}
          onModelChange={setModelId}
          contextId={contextId}
          onContextChange={setContextId}
          webSearch={webSearch}
          onWebSearchChange={setWebSearch}
          onMessagesChange={handleMessagesChange}
        />
      </section>
    </div>
  );
}
