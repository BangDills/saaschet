"use client";

import * as React from "react";
import {
  ChevronDown,
  GitBranch,
  Loader2,
  Lock,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Inline GitHub mark — `lucide-react` v1 doesn't ship the icon. */
function GitHubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      fill="currentColor"
      className={className}
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-1.96c-3.2.7-3.87-1.54-3.87-1.54-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.74 2.68 1.24 3.34.95.1-.74.4-1.24.72-1.53-2.55-.29-5.23-1.28-5.23-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18.91-.25 1.89-.38 2.86-.39.97.01 1.95.14 2.86.39 2.18-1.49 3.14-1.18 3.14-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.15v3.18c0 .31.21.66.8.55C20.22 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

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
  | { githubConnected: false; repos: []; message?: string; error?: string }
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
    username?: string | null;
    repos: UserRepo[];
    error?: string;
  }>({ kind: "idle", githubConnected: false, repos: [] });
  const [search, setSearch] = React.useState("");
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Lazy-load the user's repos the first time the popover opens.
  const loadedRef = React.useRef(false);
  React.useEffect(() => {
    if (!open) return;
    if (loadedRef.current || reposState.kind !== "idle") return;
    loadedRef.current = true;
    // Kick off the fetch — setState only happens in async callbacks below,
    // which are NOT synchronous within the effect body.
    fetch("/api/github/repos", { cache: "no-store" })
      .then(async (r) => {
        const json = (await r.json()) as ReposResponse;
        return { ok: r.ok, json };
      })
      .then(({ json }) => {
        if (!json.githubConnected) {
          setReposState({
            kind: "loaded",
            githubConnected: false,
            repos: [],
            error: "error" in json ? json.error : undefined,
          });
          return;
        }
          setReposState({
            kind: "loaded",
            githubConnected: true,
            username: json.username,
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
      setOpen(false);
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
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 sm:items-center sm:p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby="repo-dialog-title"
            className="flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-background shadow-xl sm:max-h-[760px] sm:max-w-2xl sm:rounded-2xl"
          >
            <div className="flex justify-center py-3 sm:hidden">
              <span className="h-1.5 w-16 rounded-full bg-border" />
            </div>
            <header className="px-5 pb-4 text-center sm:px-6 sm:pt-6">
              <h2 id="repo-dialog-title" className="text-2xl font-bold tracking-tight">
                Import from GitHub
              </h2>
            </header>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {/* Your repos section (only when GitHub-connected) */}
          {reposState.githubConnected ? (
            <div className="order-2 px-5 pb-5 sm:px-6">
              <div className="flex items-center justify-between pb-3">
                <p className="text-base font-medium text-muted-foreground">
                  Select a Repository
                </p>
                <span className="text-xs text-muted-foreground">
                  {reposState.repos.length} repos
                </span>
              </div>
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium">
                  <GitHubMark className="size-5 shrink-0" />
                  <span className="truncate">{reposState.username || "GitHub"}</span>
                </div>

              {reposState.error && (
                <div className="mb-2 space-y-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 dark:border-amber-900/50 dark:bg-amber-950/40">
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">
                    {reposState.error}
                  </p>
                  <a
                    href="/api/github/oauth"
                    className="inline-flex items-center gap-1 rounded text-[11px] font-medium text-amber-700 underline underline-offset-2 hover:opacity-80 dark:text-amber-300"
                  >
                    Reconnect GitHub
                  </a>
                </div>
              )}

              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or description…"
                  className="h-11 w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring/30"
                />
              </div>
              </div>

              <div className="max-h-80 overflow-y-auto rounded-xl border border-border">
                {filteredRepos.length === 0 ? (
                  <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                    {reposState.repos.length === 0 ? (
                      <>
                        <p>No repositories accessible to your account.</p>
                        <p className="mt-1 text-[11px]">
                          Make sure your GitHub account has{" "}
                          <code className="rounded bg-muted px-1 py-0.5">
                            public_repo
                          </code>{" "}
                          scope granted.
                        </p>
                      </>
                    ) : (
                      "No matches."
                    )}
                  </div>
                ) : (
                  filteredRepos.map((r) => {
                    const isActive = value === r.fullName;
                    return (
                      <button
                        key={r.fullName}
                        onClick={() => connectSlug(r.fullName)}
                        disabled={status.kind === "loading"}
                        className={cn(
                          "flex w-full items-center gap-3 border-b border-border px-4 py-4 text-left transition-colors last:border-b-0",
                          "hover:bg-muted disabled:opacity-60",
                          isActive && "bg-muted",
                        )}
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border">
                          <GitBranch className="size-4 text-muted-foreground" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-semibold">
                              {r.fullName.split("/").pop()}
                            </span>
                            {r.isPrivate && <Lock className="size-3 text-muted-foreground" />}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {new Intl.DateTimeFormat("en", { month: "short", day: "2-digit" }).format(new Date(r.updatedAt))}
                            {r.primaryLanguage ? ` · ${r.primaryLanguage}` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium">
                          {status.kind === "loading" ? "Importing" : isActive ? "Selected" : "Import"}
                        </span>
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
              <p className="text-xs font-medium">Connect your GitHub account</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Link GitHub to browse your own repositories from this picker.
                You can still paste any public repo below.
              </p>
              {reposState.error && (
                <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
                  {reposState.error}
                </p>
              )}
              <a
                href="/api/github/oauth"
                className={cn(
                  "mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md",
                  "border border-border bg-background px-2.5 py-1.5 text-xs font-medium",
                  "transition-colors hover:bg-accent",
                )}
              >
                <GitHubMark className="size-3.5" />
                Connect GitHub
              </a>
            </div>
          )}

          {/* Manual paste section (always available) */}
          <div className="order-1 px-5 pb-6 sm:px-6">
            <p className="pb-3 text-base font-medium text-muted-foreground">
              Import from a URL
            </p>

            <div className="flex overflow-hidden rounded-xl border border-border focus-within:ring-2 focus-within:ring-ring/30">
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
                placeholder="https://github.com/owner/repository"
                aria-label="GitHub repository URL"
                disabled={status.kind === "loading"}
                className="h-12 min-w-0 flex-1 bg-background px-4 text-sm outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={handleManualConnect}
                disabled={!input.trim() || status.kind === "loading"}
                className={cn(
                  "inline-flex h-12 items-center gap-1 border-l border-primary bg-primary px-5 text-sm font-semibold text-primary-foreground",
                  "transition-opacity hover:opacity-90 disabled:opacity-50",
                )}
              >
                {status.kind === "loading" && (
                  <Loader2 className="size-3 animate-spin" />
                )}
                Import
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
            <footer className="border-t border-border bg-background p-4 sm:px-6">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-11 w-full rounded-xl border border-border text-sm font-semibold transition-colors hover:bg-muted"
              >
                Back
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
