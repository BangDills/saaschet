"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { ChatPanel } from "@/components/chat/chat-panel";
import { newId } from "@/lib/chat/storage";
import type { ChatMessage, Conversation, ModelInfo, Project } from "@/lib/chat/types";
import { defaultModelId, defaultModels } from "@/lib/chat/models";
import {
  Check,
  ChevronDown,
  Folder,
  History,
  Loader2,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// The page reads ?project= via useSearchParams; force dynamic rendering so
// Next doesn't try to statically prerender it (which would warn about
// useSearchParams needing a Suspense boundary).
export const dynamic = "force-dynamic";


type ActivePanel = {
  conversationId: string;
  initialMessages: ChatMessage[];
};

type ConversationGroup = readonly [string, Conversation[]];

const LS_KEY = "celiuz:lastConversationId";
const MAX_TITLE_LENGTH = 100;

function freshPanel(): ActivePanel {
  return { conversationId: newId(), initialMessages: [] };
}

async function readApiError(response: Response, fallback: string) {
  try {
    const json = (await response.json()) as { error?: string };
    return json.error || fallback;
  } catch {
    return fallback;
  }
}

/** Compact project selector shown in the AI chat header.
 *  - Displays the active project name (or "All projects" / "Unfiled").
 *  - Lets the user pick which project a NEW chat is filed under, or move an
 *    open conversation into a project. */
function ProjectSelector({
  projects,
  loaded,
  activeProjectId,
  onChange,
}: {
  projects: Project[];
  loaded: boolean;
  activeProjectId: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;
  const label = activeProject
    ? activeProject.name
    : activeProjectId === null
      ? "All projects"
      : "Unfiled";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Select project"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-sm font-medium transition-colors sm:gap-2",
          open ? "bg-accent text-accent-foreground" : "bg-background text-foreground hover:bg-accent/60",
        )}
      >
        <Folder className="size-4 shrink-0 text-muted-foreground" />
        <span className="max-w-[10rem] truncate">{label}</span>
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Projects"
          className="absolute left-0 top-full z-50 mt-1 w-60 max-h-[24rem] overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg"
        >
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent",
              activeProjectId === null && "bg-accent text-accent-foreground",
            )}
          >
            <Folder className="size-4 shrink-0 text-muted-foreground" />
            All projects
          </button>
          {!loaded ? (
            <p className="px-2.5 py-2 text-xs text-muted-foreground">Loading…</p>
          ) : projects.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-muted-foreground">
              No projects yet. Create one from the sidebar.
            </p>
          ) : (
            projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => {
                  onChange(project.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent",
                  activeProjectId === project.id && "bg-accent text-accent-foreground",
                )}
              >
                <Folder className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{project.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}


export default function AIChatPage() {
  const searchParams = useSearchParams();
  const activeProjectId = searchParams.get("project");

  const [models, setModels] = React.useState<ModelInfo[]>(defaultModels);
  const [modelId, setModelId] = React.useState(defaultModelId);
  const [webSearch, setWebSearch] = React.useState(false);
  const [repo, setRepo] = React.useState<string | null>(null);
  const currentModel = models.find((model) => model.id === modelId);
  const agentMode = !!currentModel?.agentCapable && !!repo;

  // Projects the user has created (for the selector + history grouping).
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [projectsLoaded, setProjectsLoaded] = React.useState(false);

  // Which project a NEW chat will be filed under. Defaults to the URL
  // ?project= param when present; the user can change it via the selector.
  const [newChatProjectId, setNewChatProjectId] = React.useState<string | null>(
    activeProjectId,
  );

  // The project of the conversation currently open (null for unfiled chats
  // and for fresh chats). Drives the selector display when viewing history.
  const [activeConvProjectId, setActiveConvProjectId] = React.useState<string | null>(null);

  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [active, setActive] = React.useState<ActivePanel>(freshPanel);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [historyQuery, setHistoryQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [menuId, setMenuId] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draftTitle, setDraftTitle] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<Conversation | null>(null);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [historyError, setHistoryError] = React.useState<string | null>(null);
  const historyRef = React.useRef<HTMLDivElement>(null);
  const renameInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(historyQuery.trim()), 180);
    return () => window.clearTimeout(timeout);
  }, [historyQuery]);

  const conversationGroups = React.useMemo<ConversationGroup[]>(() => {
    const query = debouncedQuery.toLocaleLowerCase();
    // When a project filter is active (?project=ID), only show conversations
    // filed under it. Otherwise show all conversations.
    const scoped = activeProjectId
      ? conversations.filter((c) => c.projectId === activeProjectId)
      : conversations;
    const filtered = scoped
      .filter((conversation) => conversation.title.toLocaleLowerCase().includes(query))
      .sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || b.updatedAt - a.updatedAt);
    const unpinned = filtered.filter((conversation) => !conversation.isPinned);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86_400_000;
    return [
      ["Pinned", filtered.filter((conversation) => conversation.isPinned)],
      ["Today", unpinned.filter((conversation) => conversation.updatedAt >= today)],
      ["Yesterday", unpinned.filter((conversation) => conversation.updatedAt >= yesterday && conversation.updatedAt < today)],
      ["Earlier", unpinned.filter((conversation) => conversation.updatedAt < yesterday)],
    ];
  }, [conversations, debouncedQuery, activeProjectId]);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (historyRef.current && !historyRef.current.contains(event.target as Node)) {
        setHistoryOpen(false);
        setMenuId(null);
        setEditingId(null);
      }
    }
    if (!historyOpen) return;
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [historyOpen]);

  React.useEffect(() => {
    if (!historyOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (editingId) setEditingId(null);
      else if (menuId) setMenuId(null);
      else setHistoryOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [editingId, historyOpen, menuId]);

  React.useEffect(() => {
    if (editingId) renameInputRef.current?.focus();
  }, [editingId]);

  const reloadConversations = React.useCallback(async () => {
    try {
      const response = await fetch("/api/conversations", { cache: "no-store" });
      if (!response.ok) throw new Error(await readApiError(response, "Failed to load conversations"));
      const json = (await response.json()) as { conversations?: Conversation[] };
      if (Array.isArray(json.conversations)) setConversations(json.conversations);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Failed to load conversations");
    }
  }, []);

  React.useEffect(() => {
    const timeout = window.setTimeout(() => void reloadConversations(), 0);
    return () => window.clearTimeout(timeout);
  }, [reloadConversations]);

  // Load the user's projects once for the selector + history grouping.
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/projects", { cache: "no-store" })
      .then((r) => r.json())
      .then((json: { projects?: Project[] }) => {
        if (cancelled || !Array.isArray(json.projects)) return;
        setProjects(json.projects);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setProjectsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // When the URL ?project= param changes (e.g. clicked from the sidebar),
  // default new chats to that project.
  React.useEffect(() => {
    setNewChatProjectId(activeProjectId);
  }, [activeProjectId]);

  React.useEffect(() => {
    if (active.initialMessages.length === 0) return;
    try {
      localStorage.setItem(LS_KEY, active.conversationId);
    } catch {}
  }, [active.conversationId, active.initialMessages.length]);

  const openChat = React.useCallback(async (id: string) => {
    setPendingId(id);
    setHistoryError(null);
    try {
      const response = await fetch(`/api/conversations/${id}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await readApiError(response, "Failed to open conversation"));
      const json = (await response.json()) as { conversation?: Conversation };
      const conversation = json.conversation;
      if (!conversation) throw new Error("Conversation not found");
      if (conversation.modelId) setModelId(conversation.modelId);
      setRepo(conversation.githubRepo ?? null);
      setActiveConvProjectId(conversation.projectId ?? null);
      setActive({ conversationId: conversation.id, initialMessages: conversation.messages });
      setHistoryOpen(false);
      setMenuId(null);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Failed to open conversation");
    } finally {
      setPendingId(null);
    }
  }, []);

  React.useEffect(() => {
    let timeout: number | undefined;
    try {
      const lastId = localStorage.getItem(LS_KEY);
      if (lastId) timeout = window.setTimeout(() => void openChat(lastId), 0);
    } catch {}
    return () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [openChat]);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/models")
      .then((response) => response.json())
      .then((json: { models?: ModelInfo[] }) => {
        if (cancelled || !Array.isArray(json.models) || json.models.length === 0) return;
        setModels(json.models);
        setModelId((current) => json.models!.some((model) => model.id === current) ? current : json.models![0].id);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  function startNewChat() {
    setActive(freshPanel());
    setActiveConvProjectId(null);
    setNewChatProjectId(activeProjectId);
    setHistoryOpen(false);
    setMenuId(null);
    try { localStorage.removeItem(LS_KEY); } catch {}
  }


  function beginRename(conversation: Conversation) {
    setEditingId(conversation.id);
    setDraftTitle(conversation.title);
    setMenuId(null);
    setHistoryError(null);
  }

  async function patchConversation(id: string, patch: { title?: string; isPinned?: boolean; projectId?: string | null }) {
    const response = await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) throw new Error(await readApiError(response, "Failed to update conversation"));
    const json = (await response.json()) as { conversation?: Conversation };
    if (!json.conversation) throw new Error("Conversation update was not returned");
    return json.conversation;
  }

  async function saveRename(id: string) {
    const title = draftTitle.trim().replace(/\s+/g, " ");
    if (!title || title.length > MAX_TITLE_LENGTH) {
      setHistoryError(`Title must be between 1 and ${MAX_TITLE_LENGTH} characters`);
      return;
    }
    const previous = conversations;
    setPendingId(id);
    setEditingId(null);
    setConversations((items) => items.map((item) => item.id === id ? { ...item, title } : item));
    try {
      const saved = await patchConversation(id, { title });
      setConversations((items) => items.map((item) => item.id === id ? { ...item, ...saved, messages: item.messages } : item));
    } catch (error) {
      setConversations(previous);
      setHistoryError(error instanceof Error ? error.message : "Failed to rename conversation");
    } finally {
      setPendingId(null);
    }
  }

  async function togglePin(conversation: Conversation) {
    const previous = conversations;
    const isPinned = !conversation.isPinned;
    setPendingId(conversation.id);
    setMenuId(null);
    setConversations((items) => items.map((item) => item.id === conversation.id ? { ...item, isPinned } : item));
    try {
      const saved = await patchConversation(conversation.id, { isPinned });
      setConversations((items) => items.map((item) => item.id === conversation.id ? { ...item, ...saved, messages: item.messages } : item));
    } catch (error) {
      setConversations(previous);
      setHistoryError(error instanceof Error ? error.message : "Failed to update pin");
    } finally {
      setPendingId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setPendingId(target.id);
    setHistoryError(null);
    try {
      const response = await fetch(`/api/conversations/${target.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await readApiError(response, "Failed to delete conversation"));
      setConversations((items) => items.filter((item) => item.id !== target.id));
      if (active.conversationId === target.id) {
        setActive(freshPanel());
        try { localStorage.removeItem(LS_KEY); } catch {}
      }
      setDeleteTarget(null);
      setMenuId(null);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Failed to delete conversation");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="-mx-3 -my-3 flex h-full min-h-0 flex-col overflow-hidden sm:-mx-6 sm:-my-6 lg:-mx-8">
      <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background px-3 py-2 sm:px-4">
        <button
          type="button"
          aria-label="Open navigation menu"
          onClick={() => window.dispatchEvent(new Event("celiuz:open-mobile-menu"))}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        >
          <Menu className="size-4" />
        </button>

        <div ref={historyRef} className="relative">
          <button
            type="button"
            aria-label="Conversation history"
            aria-expanded={historyOpen}
            aria-haspopup="dialog"
            onClick={() => setHistoryOpen((open) => !open)}
            className={cn("flex size-9 items-center justify-center rounded-lg border border-border text-sm font-medium transition-colors sm:h-auto sm:w-auto sm:gap-2 sm:px-3 sm:py-1.5", historyOpen ? "bg-accent text-accent-foreground" : "bg-background text-foreground hover:bg-accent/60")}
          >
            <History className="size-4" />
            <span className="hidden sm:inline">History</span>
            <ChevronDown className={cn("hidden size-3.5 transition-transform sm:block", historyOpen && "rotate-180")} />
          </button>

          {historyOpen && (
            <div role="dialog" aria-label="Conversation history" className="fixed inset-x-3 bottom-3 top-20 z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl sm:absolute sm:inset-auto sm:left-0 sm:top-full sm:mt-1 sm:max-h-[30rem] sm:w-96 sm:rounded-xl">
              <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:py-2.5">
                <div>
                  <p className="text-sm font-semibold">Conversations</p>
                  <p className="text-xs text-muted-foreground">{conversations.length} saved chats</p>
                </div>
                <button type="button" aria-label="Close history" onClick={() => setHistoryOpen(false)} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <X className="size-4" />
                </button>
              </div>

              <div className="px-3 pt-3">
                <label className="flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-muted-foreground focus-within:border-ring focus-within:text-foreground focus-within:ring-2 focus-within:ring-ring/30">
                  <Search className="size-4 shrink-0" />
                  <span className="sr-only">Search conversations</span>
                  <input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Search conversations" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
                  {historyQuery && <button type="button" aria-label="Clear search" onClick={() => setHistoryQuery("")}><X className="size-3.5" /></button>}
                </label>
              </div>

              {historyError && <div role="status" className="mx-3 mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{historyError}</div>}

              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {conversations.length === 0 ? (
                  <p className="px-3 py-8 text-center text-sm text-muted-foreground">No conversations yet.<br />Start chatting to begin.</p>
                ) : conversationGroups.every(([, group]) => group.length === 0) ? (
                  <div className="px-3 py-8 text-center"><p className="text-sm font-medium text-foreground">No matching conversations</p><p className="mt-1 text-xs text-muted-foreground">Try a different title.</p></div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {conversationGroups.map(([label, group]) => group.length > 0 && (
                      <section key={label}>
                        <h3 className="flex items-center gap-1.5 px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label === "Pinned" && <Pin className="size-3" />}{label}</h3>
                        <div className="flex flex-col gap-0.5">
                          {group.map((conversation) => {
                            const isActive = conversation.id === active.conversationId;
                            const isEditing = editingId === conversation.id;
                            return (
                              <div key={conversation.id} className={cn("relative flex min-h-10 flex-wrap items-center gap-1 rounded-lg px-2 text-sm transition-colors", isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/60")}>
                                {isEditing ? (
                                  <form className="flex min-w-0 flex-1 items-center gap-1 py-1" onSubmit={(event) => { event.preventDefault(); void saveRename(conversation.id); }}>
                                    <input ref={renameInputRef} value={draftTitle} maxLength={MAX_TITLE_LENGTH} onChange={(event) => setDraftTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setEditingId(null); }} aria-label="Conversation title" className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                                    <button type="submit" aria-label="Save title" disabled={pendingId === conversation.id} className="flex size-8 items-center justify-center rounded-md text-primary hover:bg-background disabled:opacity-50"><Check className="size-4" /></button>
                                    <button type="button" aria-label="Cancel rename" onClick={() => setEditingId(null)} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-background"><X className="size-4" /></button>
                                  </form>
                                ) : (
                                  <>
                                    <button type="button" disabled={pendingId === conversation.id} onClick={() => void openChat(conversation.id)} className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left disabled:opacity-60">
                                      {pendingId === conversation.id ? <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" /> : conversation.isPinned ? <Pin className="size-3.5 shrink-0 text-primary" /> : <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />}
                                      <span className="truncate">{conversation.title}</span>
                                    </button>
                                    <button type="button" aria-label={`Actions for ${conversation.title}`} aria-expanded={menuId === conversation.id} onClick={(event) => { event.stopPropagation(); setMenuId((id) => id === conversation.id ? null : conversation.id); }} className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                      <MoreHorizontal className="size-4" />
                                    </button>
                                    {menuId === conversation.id && (
                                      <div className="order-last mb-2 ml-auto flex w-full basis-full flex-col rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-sm">
                                        <button type="button" onClick={() => beginRename(conversation)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent"><Pencil className="size-3.5" />Rename</button>
                                        <button type="button" onClick={() => void togglePin(conversation)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent">{conversation.isPinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}{conversation.isPinned ? "Unpin" : "Pin"}</button>
                                        <button type="button" onClick={() => { setDeleteTarget(conversation); setMenuId(null); }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-destructive hover:bg-destructive/10"><Trash2 className="size-3.5" />Delete</button>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Project selector: shows the active project (for an open chat) or
            the project a NEW chat will be filed under. Changing it on a fresh
            chat updates where the next conversation is created. */}
        <ProjectSelector
          projects={projects}
          loaded={projectsLoaded}
          activeProjectId={activeConvProjectId ?? newChatProjectId}
          onChange={(id) => {
            if (active.initialMessages.length === 0) {
              // Fresh chat — set the filing project for the next send.
              setNewChatProjectId(id);
            } else {
              // Open conversation — move it to the selected project (or unfile).
              const conv = active;
              void patchConversation(conv.conversationId, { projectId: id })
                .then((saved) => {
                  setConversations((items) =>
                    items.map((item) =>
                      item.id === conv.conversationId
                        ? { ...item, ...saved, messages: item.messages }
                        : item,
                    ),
                  );
                  setActiveConvProjectId(saved.projectId ?? null);
                })
                .catch((err) =>
                  setHistoryError(
                    err instanceof Error ? err.message : "Failed to move conversation",
                  ),
                );
            }
          }}
        />

        <button type="button" aria-label="Start new chat" onClick={startNewChat} className="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-auto sm:w-auto sm:gap-2 sm:px-3 sm:py-1.5">
          <Plus className="size-4" />
          <span className="hidden sm:inline">New chat</span>
        </button>
      </div>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <ChatPanel
          key={active.conversationId}
          conversationId={active.conversationId}
          initialMessages={active.initialMessages}
          modelId={modelId}
          models={models}
          onModelChange={setModelId}
          webSearch={webSearch || agentMode}
          onWebSearchChange={setWebSearch}
          repo={repo}
          onRepoChange={setRepo}
          projectId={activeConvProjectId ?? newChatProjectId}
          onProjectIdChange={setNewChatProjectId}
          agentMode={agentMode}
          onAssistantFinish={reloadConversations}
        />
      </section>

      {deleteTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground/20 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && pendingId !== deleteTarget.id) setDeleteTarget(null); }}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-description" className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-xl">
            <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive"><Trash2 className="size-5" /></div>
            <h2 id="delete-title" className="mt-4 text-lg font-semibold text-balance">Delete conversation?</h2>
            <p id="delete-description" className="mt-2 text-sm leading-6 text-muted-foreground">“{deleteTarget.title}” and all of its messages will be permanently deleted.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={pendingId === deleteTarget.id} onClick={() => setDeleteTarget(null)} className="h-9 rounded-lg border border-border px-3 text-sm font-medium hover:bg-accent disabled:opacity-50">Cancel</button>
              <button type="button" disabled={pendingId === deleteTarget.id} onClick={() => void confirmDelete()} className="flex h-9 items-center gap-2 rounded-lg bg-destructive px-3 text-sm font-semibold text-destructive-foreground hover:opacity-90 disabled:opacity-50">{pendingId === deleteTarget.id && <Loader2 className="size-4 animate-spin" />}Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
