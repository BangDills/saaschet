"use client";

import * as React from "react";
import { ChevronDown, GitBranch, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export type RepoSelectorProps = {
  /** Currently connected repo as "owner/name", or null when none. */
  value: string | null;
  onChange: (next: string | null) => void;
};

/**
 * "Select repo" button — UI placeholder for an upcoming GitHub integration.
 *
 * For now the popover lets the user paste an `owner/repo` reference. We
 * persist the string locally so the pill in the toolbar can show it, but
 * we don't yet fetch repo content. Wiring real GitHub OAuth + content
 * fetching is queued for a follow-up iteration.
 */
export function RepoSelector({ value, onChange }: RepoSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState("");
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function handleConnect() {
    const cleaned = input.trim();
    // Accept `owner/repo` or full GitHub URL.
    const match = cleaned.match(
      /^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+)(?:\/.*)?$/i,
    );
    if (!match) return;
    onChange(`${match[1]}/${match[2]}`);
    setInput("");
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        title="Select repository (coming soon)"
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <GitBranch className="size-4" />
        <span>{value ? "Repo" : "Select repo"}</span>
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
            reference or full GitHub URL. Repo content access is coming in a
            future update.
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConnect();
              }}
              placeholder="cloudmail280/saaschet"
              className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring/30"
            />
            <button
              type="button"
              onClick={handleConnect}
              disabled={!input.trim()}
              className={cn(
                "inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground",
                "transition-opacity hover:opacity-90 disabled:opacity-50",
              )}
            >
              <Plus className="size-3" />
              Connect
            </button>
          </div>

          {value && (
            <button
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
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
