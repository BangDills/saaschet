"use client";

import * as React from "react";
import { Check, ChevronDown, Copy, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Markdown } from "./markdown";
import { ExpandableSection } from "./activity/ExpandableSection";

/**
 * Long generated documents (PRDs) render in the chat transcript as a compact
 * attachment-style card instead of a wall of markdown — the artifact pattern.
 * Purely presentational: the full text stays in the message (and in the model
 * context); this only changes how it is shown.
 */

/** Recognize a PRD produced by the generator's mandated heading. */
export function isPrdDocument(text: string): boolean {
  return /^\s*#\s+Product Requirement Document/i.test(text);
}

function extractTitle(content: string): string {
  const match = content.match(/\*\*Product Name\*\*:?\s*(.+)/);
  if (!match) return "Product Requirement Document";
  // Strip markdown emphasis and keep the name part before an em-dash tagline.
  const cleaned = match[1].replace(/[*_`]/g, "").split(/\s+[—–-]\s+/)[0].trim();
  return cleaned ? `PRD — ${cleaned}` : "Product Requirement Document";
}

export function DocumentCard({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const title = React.useMemo(() => extractTitle(content), [content]);
  const sections = React.useMemo(
    () => (content.match(/^##\s/gm) ?? []).length,
    [content],
  );
  const words = React.useMemo(
    () => content.trim().split(/\s+/).length,
    [content],
  );

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="my-3 rounded-xl border border-border bg-card">
      <div className="flex w-full items-center gap-2 p-3 pr-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Tutup dokumen" : "Lihat dokumen"}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <FileText className="size-4" />
          </span>

          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-foreground">
              {title}
            </span>
            <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              {streaming && (
                <span
                  aria-hidden
                  className="size-1.5 animate-pulse rounded-full bg-foreground/60 motion-reduce:animate-none"
                />
              )}
              {streaming
                ? `Sedang menulis… · ~${words} kata`
                : `${sections} bagian · ~${words.toLocaleString("id-ID")} kata`}
            </span>
          </span>

          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>

        <button
          type="button"
          aria-label={copied ? "Tersalin" : "Salin dokumen"}
          onClick={() => void handleCopy()}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copied ? (
            <Check className="size-4 text-emerald-500" />
          ) : (
            <Copy className="size-4" />
          )}
        </button>
      </div>

      <ExpandableSection open={open}>
        <div className="border-t border-border px-4 pb-4 pt-3">
          <Markdown streaming={streaming}>{content}</Markdown>
        </div>
      </ExpandableSection>
    </div>
  );
}
