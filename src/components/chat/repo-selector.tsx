"use client";

import * as React from "react";
import { ChevronDown, GitBranch, Loader2, Plus } from "lucide-react";
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

/**
 * "Select repo" — connects a public GitHub repository to the current
 * conversation. On Connect we hit `/api/github/repo?slug=…` which:
 *   1. validates the repo exists
 *   2. (server-side) caches the README + manifest + file tree
 *   3. returns a small preview we render below
 *
 * The `value` lifted to the page is sent in the body of every /api/chat
 * request so the connected repo's content is injected into the system
 * prompt.
 */
export function RepoSelector({ value, onChange }: RepoSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [status, setStatus] = React.useState<ConnectStatus>({ kind: "idle" });
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function handleConnect() {
    const cleaned = input.trim();
    const match = cleaned.match(
      /^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/.*)?$/i,
    );
    if (!match) {
      setStatus({ kind: "error", message: "Use the form owner/repo." });
      return;
    }
    const slug = `${match[1]}/${match[2]}`;
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
        <div className="absolute bottom-full left-0 z-30 mb-2 w-80 overflow-hidden rounded-xl border border-border bg-card p-3 shadow-lg">
          <div className="flex items-center gap-2 pb-2">
            <GitBranch className="size-4 text-muted-foreground" />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Connect a GitHub repo
            </p>
          </div>

          <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
            Paste an{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.78em]">
              owner/repo
            </code>{" "}
            reference or full GitHub URL. Public repos work without signing
            in to GitHub.
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (status.kind === "error") setStatus({ kind: "idle" });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConnect();
              }}
              placeholder="vercel/next.js"
              disabled={status.kind === "loading"}
              className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={handleConnect}
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
      )}
    </div>
  );
}
