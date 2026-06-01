"use client";

import * as React from "react";
import { MessageSquare, Plus, Trash2 } from "lucide-react";
import type { Conversation } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

export type ConversationListProps = {
  items: Conversation[];
  activeId?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
};

export function ConversationList({
  items,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: ConversationListProps) {
  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <button
        onClick={onNew}
        className="flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:opacity-90"
      >
        <Plus className="size-4" />
        New chat
      </button>

      <div className="mt-2 flex-1 space-y-1 overflow-y-auto">
        {items.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            No conversations yet. Start chatting to begin.
          </p>
        ) : (
          items.map((conv) => {
            const active = conv.id === activeId;
            return (
              <div
                key={conv.id}
                className={cn(
                  "group flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/60",
                )}
              >
                <button
                  onClick={() => onSelect(conv.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{conv.title}</span>
                </button>
                <button
                  onClick={() => onDelete(conv.id)}
                  aria-label="Delete conversation"
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-red-500 group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
