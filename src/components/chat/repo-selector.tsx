"use client";

import * as React from "react";
import {
  ChevronDown,
  GitBranch,
  Loader2,
  Lock,
  Plus,
  Search,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type RepoSelectorProps = {
  /** Currently connected repo as "owner/name", or null when none. */
  value: string | null;
  onChange: (next: string | null) => void;
};

type ConnectStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "ok";
      slug: string;
      stars?: number;
      language?: string | null;
      hasReadme: boolean;
      fileCount: number;
    }
  | { kind: "error"; message: string };

type UserRepo = {
  fullName: string;
  description: string | null;
  primaryLanguage: string | null;
  stars: number;
  isPrivate: boolean;
  isFork: boolean;
  updatedAt: number;
};

type ReposResponse =
  | { githubConnected: false; repos: []; message?: string }
  | {
      githubConnected: true;
      username?: string | null;
      repos: UserRepo[];
      error?: string;
    };

/**
 * "Select repo" — connect a GitHub repository to the current conversation.
 *
 *   - Top: search box + autocomplete list of the user's own repos (only
 *     populated when they signed in with GitHub OAuth).
 *   - Bottom: manual paste of any public repo URL / slug as a fallback.
 *
 * Both paths ultimately hit `/api/github/repo?slug=…` to validate + warm
 * the server-side cache, then propagate the slug up to the page so it's
 * sent in every subsequent /api/chat body.
 */
export function RepoSelector({ value, onChange }: RepoSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [status, setStatus] = React.useState<ConnectStatus>({ kind: "idle" });
  const [reposState, setReposState] = React.useState<{
    kind: "idle" | "loading" | "loaded" | "error";
    githubConnected: boolean;
    repos: UserRepo[];
    error?: string;
  }>({ kind: "idle", githubConnected: false, repos: [] });
  const [search, setSearch] = React.useState("");
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Lazy-load the user's repos the first time the popover opens.
  React.useEffect(() => {
    if (!open) return;
    if (reposState.kind !== "idle") return;
    setReposState({ kind: "loading", githubConnected: false, repos: [] });
    fetch("/api/github/repos", { cache: "no-store" })
      .then((r) => r.json() as Promise<ReposResponse>)
      .then((json) => {
        if (!json.githubConnected) {
          setReposState({
            kind: "loaded",
            githubConnected: false,
            repos: [],
          });
          return;
        }
        setReposState({
          kind: "loaded",
          githubConnected: true,
          repos: json.repos,
          error: "error" in json ? json.error : undefined,
        });
      })
      .catch((err) => {
        setReposState({
          kind: "error",
          githubConnected: false,
          repos: [],
          error: err instanceof Error ? err.message : "Network error",
        });
      });
  }, [open, reposState.kind]);

  const filteredRepos = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return reposState.repos;
    return reposState.repos.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        (r.description?.toLowerCase().includes(q) ?? false),
    );
  }, [reposState.repos, search]);

  async function connectSlug(slug: string) {
    setStatus({ kind: "loading" });
    try {
      const res = await fetch(
        `/api/github/repo?slug=${encodeURIComponent(slug)}`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as
        | {
            slug: string;
            info: {
              fullName: string;
              stars: number;
              primaryLanguage: string | null;
              isPrivate: boolean;
            };
            hasReadme: boolean;
            hasManifest: boolean;
            fileCount: number;
          }
        | { error: string };
      if (!res.ok || "error" in json) {
        const msg = "error" in json ? json.error : `HTTP ${res.status}`;
        setStatus({ kind: "error", message: msg });
        return;
      }
      onChange(json.slug);
      setStatus({
        kind: "ok",
        slug: json.slug,
        stars: json.info.stars,
        language: json.info.primaryLanguage,
        hasReadme: json.hasReadme,
        fileCount: json.fileCount,
      });
      setInput("");
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  function handleManualConnect() {
    const cleaned = input.trim();
    const match = cleaned.match(
      /^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/.*)?$/i,
    );
    if (!match) {
      setStatus({ kind: "error", message: "Use the form owner/repo." });
      return;
    }
    void connectSlug(`${match[1]}/${match[2]}`);
  }

  function handleDisconnect() {
    onChange(null);
    setStatus({ kind: "idle" });
    setInput("");
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        title={value ? `Connected to ${value}` : "Select a GitHub repository"}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <GitBranch className="size-4" />
        <span>{value ? value : "Select repo"}</span>
        <ChevronDown className="size-3 opacity-70" />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-2 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          {/* Your repos section (only when GitHub-connected) */}
          {reposState.githubConnected ? (
            <div className="border-b border-border p-3">
              <div className="flex items-center justify-between pb-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Your repositories
                </p>
                <span className="text-[10px] text-muted-foreground">
                  {reposState.repos.length} loaded
                </span>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or description…"
                  className="w-full rounded-md border border-border bg-background py-1.5 pl-7 pr-2 text-xs outline-none focus:ring-2 focus:ring-ring/30"
                />
              </div>

              <div className="mt-2 max-h-56 overflow-y-auto">
                {filteredRepos.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                    {reposState.repos.length === 0
                      ? "No repositories accessible to your account."
                      : "No matches."}
                  </p>
                ) : (
                  filteredRepos.map((r) => {
                    const isActive = value === r.fullName;
                    const isLoading =
                      status.kind === "loading" &&
                      input.trim() === "" &&
                      // when clicking a list item we set status loading but
                      // don't write to input — there's no perfect match,
                      // best-effort highlight.
                      false;
                    return (
                      <button
                        key={r.fullName}
                        onClick={() => connectSlug(r.fullName)}
                        disabled={status.kind === "loading"}
                        className={cn(
                          "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors",
                          "hover:bg-accent disabled:opacity-60",
                          isActive && "bg-accent",
                        )}
                      >
                        <GitBranch className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <span className="truncate text-xs font-medium">
                              {r.fullName}
                            </span>
                            {r.isPrivate && (
                              <Lock className="size-3 shrink-0 text-muted-foreground" />
                            )}
                            {r.isFork && (
                              <span className="rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground">
                                fork
                              </span>
                            )}
                          </div>
                          {r.description && (
                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                              {r.description}
                            </p>
                          )}
                          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                            {r.primaryLanguage && (
                              <span>{r.primaryLanguage}</span>
                            )}
                            {r.stars > 0 && (
                              <span className="flex items-center gap-0.5">
                                <Star className="size-2.5" />
                                {r.stars}
                              </span>
                            )}
                          </div>
                        </div>
                        {isLoading && (
                          <Loader2 className="size-3 animate-spin text-muted-foreground" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : reposState.kind === "loading" ? (
            <div className="border-b border-border p-3">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                Loading your repositories…
              </p>
            </div>
          ) : (
            <div className="border-b border-border p-3">
              <p className="text-xs font-medium">Sign in with GitHub</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Sign in with GitHub from the login page to browse your own
                repositories here. You can still paste any public repo
                below.
              </p>
            </div>
          )}

          {/* Manual paste section (always available) */}
          <div className="p-3">
            <div className="flex items-center gap-2 pb-2">
              <GitBranch className="size-4 text-muted-foreground" />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Or paste a public repo
              </p>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  if (status.kind === "error") setStatus({ kind: "idle" });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleManualConnect();
                }}
                placeholder="vercel/next.js"
                disabled={status.kind === "loading"}
                className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={handleManualConnect}
                disabled={!input.trim() || status.kind === "loading"}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground",
                  "transition-opacity hover:opacity-90 disabled:opacity-50",
                )}
              >
                {status.kind === "loading" ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Plus className="size-3" />
                )}
                Connect
              </button>
            </div>

            {status.kind === "error" && (
              <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                {status.message}
              </p>
            )}

            {status.kind === "ok" && (
              <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
                Connected to <strong>{status.slug}</strong>
                <div className="mt-0.5 text-muted-foreground">
                  ★ {status.stars ?? 0}
                  {status.language ? ` · ${status.language}` : ""} ·{" "}
                  {status.fileCount} files
                  {status.hasReadme ? " · README included" : ""}
                </div>
              </div>
            )}

            {value && (
              <button
                onClick={handleDisconnect}
                className="mt-3 w-full rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent"
              >
                Disconnect {value}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
