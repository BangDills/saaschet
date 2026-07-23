"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  Folder,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X,
  Check,
  Loader2,
} from "lucide-react";
import type { Project } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

async function readApiError(response: Response, fallback: string) {
  try {
    const json = (await response.json()) as { error?: string };
    return json.error || fallback;
  } catch {
    return fallback;
  }
}

export type ProjectsListProps = {
  /** Pre-loaded projects (e.g. from server). If absent, the component
   *  fetches /api/projects itself. */
  initialProjects?: Project[];
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

export function ProjectsList({ initialProjects }: ProjectsListProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeProjectId = searchParams.get("project");

  const [projects, setProjects] = React.useState<Project[]>(
    initialProjects ?? [],
  );
  const [open, setOpen] = React.useState(true);
  const [menuId, setMenuId] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draftName, setDraftName] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState<boolean>(!!initialProjects);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const renameRef = React.useRef<HTMLInputElement>(null);

  const reload = React.useCallback(async () => {
    try {
      const res = await fetch("/api/projects", { cache: "no-store" });
      if (!res.ok) throw new Error(await readApiError(res, "Failed to load projects"));
      const json = (await res.json()) as { projects?: Project[] };
      if (Array.isArray(json.projects)) setProjects(json.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoaded(true);
    }
  }, []);

  React.useEffect(() => {
    if (initialProjects) return;
    void reload();
  }, [initialProjects, reload]);

  // Keep the list fresh when navigating to/from a project view.
  React.useEffect(() => {
    void reload();
    // We intentionally only re-sync on pathname change, not on every
    // searchParam tweak, to avoid refetch churn while toggling projects.
  }, [pathname, reload]);

  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuId(null);
        setEditingId(null);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  React.useEffect(() => {
    if (editingId) renameRef.current?.focus();
  }, [editingId]);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (editingId) setEditingId(null);
      else if (menuId) setMenuId(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editingId, menuId]);

  async function createProject() {
    const name = newName.trim().replace(/\s+/g, " ");
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Failed to create project"));
      const json = (await res.json()) as { project?: Project };
      if (json.project) {
        setProjects((items) => [json.project!, ...items]);
        setNewName("");
        setOpen(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  }

  async function saveRename(id: string) {
    const name = draftName.trim().replace(/\s+/g, " ");
    if (!name) {
      setError("Project name cannot be empty");
      return;
    }
    const previous = projects;
    setPendingId(id);
    setEditingId(null);
    setProjects((items) =>
      items.map((p) => (p.id === id ? { ...p, name } : p)),
    );
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Failed to rename project"));
      const json = (await res.json()) as { project?: Project };
      if (json.project) {
        setProjects((items) =>
          items.map((p) => (p.id === id ? { ...p, ...json.project! } : p)),
        );
      }
    } catch (err) {
      setProjects(previous);
      setError(err instanceof Error ? err.message : "Failed to rename project");
    } finally {
      setPendingId(null);
    }
  }

  async function deleteProject(project: Project) {
    const previous = projects;
    setPendingId(project.id);
    setMenuId(null);
    setProjects((items) => items.filter((p) => p.id !== project.id));
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readApiError(res, "Failed to delete project"));
      // If the active view was this project, drop the filter so the chat
      // page falls back to showing all conversations.
      if (activeProjectId === project.id) {
        const next = new URLSearchParams(searchParams.toString());
        next.delete("project");
        router.replace(`/ai-chat${next.toString() ? `?${next.toString()}` : ""}`);
      }
    } catch (err) {
      setProjects(previous);
      setError(err instanceof Error ? err.message : "Failed to delete project");
    } finally {
      setPendingId(null);
    }
  }

  function beginRename(project: Project) {
    setEditingId(project.id);
    setDraftName(project.name);
    setMenuId(null);
    setError(null);
  }

  return (
    <div ref={containerRef} className="mt-2 flex flex-col">
      <div className="flex items-center justify-between px-3 pb-1 pt-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          aria-expanded={open}
        >
          <ChevronDown
            className={cn("size-3 transition-transform", !open && "-rotate-90")}
          />
          Projects
        </button>
        <button
          type="button"
          aria-label="New project"
          onClick={() => {
            setOpen(true);
            document
              .getElementById("projects-new-input")
              ?.focus();
          }}
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-0.5 px-2">
          {/* Inline create row */}
          <div className="flex items-center gap-1 rounded-lg px-1 py-1">
            <input
              id="projects-new-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void createProject();
                if (e.key === "Escape") setNewName("");
              }}
              placeholder="New project name"
              maxLength={100}
              className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
            {newName.trim() && (
              <button
                type="button"
                aria-label="Create project"
                onClick={() => void createProject()}
                disabled={creating}
                className="flex size-8 items-center justify-center rounded-md text-primary transition-colors hover:bg-muted disabled:opacity-50"
              >
                {creating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
              </button>
            )}
          </div>

          {error && (
            <p className="px-2 py-1 text-[11px] text-destructive">{error}</p>
          )}

          {!loaded ? (
            <p className="px-2 py-2 text-[11px] text-muted-foreground">Loading…</p>
          ) : projects.length === 0 ? (
            <p className="px-2 py-2 text-[11px] text-muted-foreground">
              No projects yet. Group your chats by creating one above.
            </p>
          ) : (
            projects.map((project) => {
              const isActive = activeProjectId === project.id;
              const isEditing = editingId === project.id;
              return (
                <div
                  key={project.id}
                  className={cn(
                    "relative flex min-h-9 items-center gap-1 rounded-lg px-1 text-[13px] transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted",
                  )}
                >
                  {isEditing ? (
                    <form
                      className="flex min-w-0 flex-1 items-center gap-1 py-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void saveRename(project.id);
                      }}
                    >
                      <input
                        ref={renameRef}
                        value={draftName}
                        maxLength={100}
                        onChange={(e) => setDraftName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        aria-label="Project name"
                        className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <button
                        type="submit"
                        aria-label="Save name"
                        disabled={pendingId === project.id}
                        className="flex size-7 items-center justify-center rounded-md text-primary hover:bg-background disabled:opacity-50"
                      >
                        <Check className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Cancel rename"
                        onClick={() => setEditingId(null)}
                        className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-background"
                      >
                        <X className="size-3.5" />
                      </button>
                    </form>
                  ) : (
                    <>
                      <Link
                        href={`/ai-chat?project=${project.id}`}
                        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-1 text-left"
                      >
                        {isActive ? (
                          <FolderOpen
                            className={cn("size-4 shrink-0", colorClass(project.color))}
                          />
                        ) : (
                          <Folder
                            className={cn("size-4 shrink-0", colorClass(project.color))}
                          />
                        )}
                        <span className="truncate">{project.name}</span>
                      </Link>
                      <button
                        type="button"
                        aria-label={`Actions for ${project.name}`}
                        aria-expanded={menuId === project.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuId((id) =>
                            id === project.id ? null : project.id,
                          );
                        }}
                        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    </>
                  )}

                  {menuId === project.id && (
                    <div className="absolute left-1 top-full z-40 mb-1 ml-0 flex w-44 flex-col rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md">
                      <button
                        type="button"
                        onClick={() => beginRename(project)}
                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-accent"
                      >
                        <Pencil className="size-3.5" /> Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteProject(project)}
                        disabled={pendingId === project.id}
                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      >
                        {pendingId === project.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
