"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  Folder,
  FolderOpen,
  GitBranch,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

const LS_KEY = "celiuz:lastConversationId";
const OPEN_CONVERSATION_EVENT = "celiuz:open-conversation";

export type ThreadChat = {
  id: string;
  title: string;
  modelId: string | null;
  githubRepo: string | null;
  updatedAt: number;
};

export type ProjectGroup = {
  id: string;
  name: string;
  color: string;
  chats: ThreadChat[];
};

const PROJECT_COLORS: Record<string, string> = {
  default: "text-muted-foreground",
  blue: "text-blue-500",
  green: "text-emerald-500",
  amber: "text-amber-500",
  red: "text-red-500",
  purple: "text-violet-500",
};

function colorClass(color: string): string {
  return PROJECT_COLORS[color] ?? PROJECT_COLORS.default;
}

function formatDate(ms: number): string {
  return new Intl.DateTimeFormat("id", {
    day: "numeric",
    month: "short",
  }).format(new Date(ms));
}

/**
 * The /threads browser: collapsible project groups, each listing its chats.
 * Tapping a chat opens it in the ai-chat page (same mechanism as the
 * sidebar's recent list).
 */
export function ThreadsBrowser({
  groups,
  unfiled,
}: {
  groups: ProjectGroup[];
  unfiled: ThreadChat[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = React.useState("");
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});

  function openChat(id: string) {
    try {
      localStorage.setItem(LS_KEY, id);
    } catch {}
    if (pathname.startsWith("/ai-chat")) {
      window.dispatchEvent(
        new CustomEvent(OPEN_CONVERSATION_EVENT, { detail: { id } }),
      );
    } else {
      router.push("/ai-chat");
    }
  }

  const q = query.trim().toLowerCase();
  function filter(chats: ThreadChat[]): ThreadChat[] {
    if (!q) return chats;
    return chats.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.githubRepo?.toLowerCase().includes(q) ?? false),
    );
  }

  const visibleGroups = groups
    .map((g) => ({ ...g, chats: filter(g.chats) }))
    .filter((g) => !q || g.chats.length > 0);
  const visibleUnfiled = filter(unfiled);

  const totalChats = groups.reduce((n, g) => n + g.chats.length, 0) + unfiled.length;

  return (
    <div className="space-y-4">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cari thread…"
        className="h-10 w-full max-w-md rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />

      {totalChats === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <MessageSquare className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Belum ada percakapan</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Mulai chat baru dari halaman AI Agent — percakapan Anda akan
            terkelompok di sini.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleGroups.map((group) => {
            const isCollapsed = collapsed[group.id] ?? false;
            return (
              <section
                key={group.id}
                className="overflow-hidden rounded-xl border border-border bg-card"
              >
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((c) => ({ ...c, [group.id]: !isCollapsed }))
                  }
                  className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                  aria-expanded={!isCollapsed}
                >
                  {isCollapsed ? (
                    <Folder className={cn("size-4 shrink-0", colorClass(group.color))} />
                  ) : (
                    <FolderOpen className={cn("size-4 shrink-0", colorClass(group.color))} />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {group.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {group.chats.length} thread
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-4 text-muted-foreground transition-transform",
                      isCollapsed && "-rotate-90",
                    )}
                  />
                </button>

                {!isCollapsed && (
                  <div className="border-t border-border">
                    {group.chats.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-muted-foreground">
                        Belum ada thread di project ini.
                      </p>
                    ) : (
                      group.chats.map((chat) => (
                        <ChatRow key={chat.id} chat={chat} onOpen={openChat} />
                      ))
                    )}
                  </div>
                )}
              </section>
            );
          })}

          {visibleUnfiled.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2.5 px-4 py-3">
                <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 text-sm font-semibold">
                  Tanpa project
                </span>
                <span className="text-xs text-muted-foreground">
                  {visibleUnfiled.length} thread
                </span>
              </div>
              <div className="border-t border-border">
                {visibleUnfiled.map((chat) => (
                  <ChatRow key={chat.id} chat={chat} onOpen={openChat} />
                ))}
              </div>
            </section>
          )}

          {q && visibleGroups.length === 0 && visibleUnfiled.length === 0 && (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">
              Tidak ada thread yang cocok dengan &ldquo;{query}&rdquo;.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ChatRow({
  chat,
  onOpen,
}: {
  chat: ThreadChat;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(chat.id)}
      className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/50"
    >
      <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{chat.title}</p>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          {chat.githubRepo && (
            <span className="flex items-center gap-1 truncate">
              <GitBranch className="size-3" />
              {chat.githubRepo.split("/").pop()}
            </span>
          )}
          {chat.modelId && <span className="truncate">{chat.modelId}</span>}
        </div>
      </div>
      <span className="shrink-0 text-[11px] text-muted-foreground">
        {formatDate(chat.updatedAt)}
      </span>
    </button>
  );
}
