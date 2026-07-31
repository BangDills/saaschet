"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, MessageSquare } from "lucide-react";

const LS_KEY = "celiuz:lastConversationId";
/** Fired by the credits meter flow after every finished turn — a reliable
 *  "something changed" signal we can piggyback on for freshness. */
const CREDITS_REFRESH_EVENT = "celiuz:credits:refresh";
/** Tells an already-mounted ai-chat page to open a conversation in place. */
export const OPEN_CONVERSATION_EVENT = "celiuz:open-conversation";

const MAX_ITEMS = 3;

type ConversationLite = {
  id: string;
  title: string;
  updatedAt: number;
};

// Module-level cache so navigation never flashes an empty list.
let chatsCache: ConversationLite[] | null = null;

/**
 * The sidebar's last-N conversations — fills what used to be a large dead
 * zone between the nav and the projects section, and puts recent chats one
 * click away (the pattern every chat product has trained users on).
 */
export function RecentChats() {
  const router = useRouter();
  const pathname = usePathname();
  const [chats, setChats] = React.useState<ConversationLite[]>(
    chatsCache ?? [],
  );

  const refresh = React.useCallback(async () => {
    try {
      const res = await fetch("/api/conversations", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as {
        conversations?: Array<{ id: string; title: string; updatedAt: number }>;
      };
      if (Array.isArray(json.conversations)) {
        const lite = json.conversations
          .slice(0, MAX_ITEMS)
          .map(({ id, title, updatedAt }) => ({ id, title, updatedAt }));
        chatsCache = lite;
        setChats(lite);
      }
    } catch {
      // Non-fatal; the list just stays stale.
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- state is only set
     after awaited fetches; this is the standard subscribe pattern. */
  React.useEffect(() => {
    void refresh();
    const handler = () => void refresh();
    window.addEventListener(CREDITS_REFRESH_EVENT, handler);
    return () => window.removeEventListener(CREDITS_REFRESH_EVENT, handler);
  }, [refresh]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function openChat(id: string) {
    try {
      localStorage.setItem(LS_KEY, id);
    } catch {}
    if (pathname.startsWith("/ai-chat")) {
      // The chat page is mounted — tell it to switch in place.
      window.dispatchEvent(
        new CustomEvent(OPEN_CONVERSATION_EVENT, { detail: { id } }),
      );
    } else {
      // The chat page restores LS_KEY on mount.
      router.push("/ai-chat");
    }
  }

  if (chats.length === 0) return null;

  return (
    <div className="mt-5">
      <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Terakhir
      </p>
      <div className="flex flex-col gap-0.5">
        {chats.map((chat) => (
          <button
            key={chat.id}
            type="button"
            onClick={() => openChat(chat.id)}
            className="group flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-[13px] text-sidebar-foreground transition-colors hover:bg-muted"
            title={chat.title}
          >
            <MessageSquare className="size-[15px] shrink-0 text-muted-foreground" />
            <span className="truncate">{chat.title}</span>
          </button>
        ))}
      </div>
      <Link
        href="/threads"
        className="mt-1 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-sidebar-foreground"
      >
        Semua
        <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}
