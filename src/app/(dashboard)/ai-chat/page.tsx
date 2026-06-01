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

/** A snapshot of which messages the panel was mounted with. */
type PanelInstance = {
  /** React key — only changes on explicit user action (new chat or open chat) */
  key: string;
  initialMessages: ChatMessage[];
};

const FRESH_PANEL: PanelInstance = { key: "new", initialMessages: [] };

export default function AIChatPage() {
  const [models, setModels] = React.useState<ModelInfo[]>(defaultModels);
  const [modelId, setModelId] = React.useState<string>(defaultModelId);
  const [conversations, setConversations] = React.useState<Conversation[]>([]);

  /** id we are persisting to. `null` until first message of a new chat. */
  const [activeId, setActiveId] = React.useState<string | null>(null);

  /** React identity of the chat panel — controls when useChat resets. */
  const [panel, setPanel] = React.useState<PanelInstance>(FRESH_PANEL);

  // Hydrate conversations from localStorage on mount.
  React.useEffect(() => {
    setConversations(listConversations());
  }, []);

  // Fetch live model list from /api/models on mount.
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

  // Called by ChatPanel whenever messages change. We persist here AND
  // create the conversation id on the first user message of a fresh chat.
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
      {/* Conversations sidebar */}
      <aside className="hidden w-72 shrink-0 border-r border-border bg-card md:flex md:flex-col">
        <ConversationList
          items={conversations}
          activeId={activeId ?? undefined}
          onSelect={openChat}
          onNew={startNewChat}
          onDelete={removeChat}
        />
      </aside>

      {/* Chat panel — model selector now lives inside the chat input */}
      <section className="flex min-w-0 flex-1 flex-col">
        <ChatPanel
          key={panel.key}
          conversationId={panel.key}
          initialMessages={panel.initialMessages}
          modelId={modelId}
          models={models}
          onModelChange={setModelId}
          onMessagesChange={handleMessagesChange}
        />
      </section>
    </div>
  );
}
