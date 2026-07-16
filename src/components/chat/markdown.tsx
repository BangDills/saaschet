"use client";

import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────────────────
 * Streaming context
 *
 * Tells code blocks whether the parent message is still being streamed.
 * We deliberately DO NOT run Prism syntax highlighting during streaming —
 * that's the single biggest source of jank. Instead we render a small
 * collapsed pill and skip the heavy work.
 * ────────────────────────────────────────────────────────────────────── */

const StreamingContext = React.createContext(false);

/* ─────────────────────────────────────────────────────────────────────────
 * Code block
 * ────────────────────────────────────────────────────────────────────── */

type CodeBlockProps = {
  language: string;
  code: string;
};

function CodeBlockHeader({
  language,
  code,
  open,
  toggle,
  inProgress,
}: {
  language: string;
  code: string;
  open: boolean;
  toggle: () => void;
  inProgress: boolean;
}) {
  const [copied, setCopied] = React.useState(false);
  const lineCount = React.useMemo(() => code.split("\n").length, [code]);

  async function copy(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-xs",
        "border-b border-white/10 transition-colors",
        open ? "text-zinc-300" : "text-zinc-400 hover:text-zinc-200",
      )}
    >
      {open ? (
        <ChevronDown className="size-3.5 shrink-0" />
      ) : (
        <ChevronRight className="size-3.5 shrink-0" />
      )}
      <Code2
        className={cn(
          "size-3.5 shrink-0",
          inProgress && "animate-pulse text-violet-400",
        )}
      />
      <span className="font-mono">{language || "text"}</span>
      <span className="text-zinc-500">·</span>
      <span className="text-zinc-500">
        {inProgress
          ? `streaming · ${lineCount} ${lineCount === 1 ? "line" : "lines"}`
          : `${lineCount} ${lineCount === 1 ? "line" : "lines"}`}
      </span>

      <span
        role="button"
        tabIndex={0}
        onClick={copy}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            void copy(e as unknown as React.MouseEvent);
          }
        }}
        className="ml-auto flex cursor-pointer items-center gap-1 rounded text-zinc-400 transition-colors hover:text-zinc-100"
        aria-label="Copy code"
      >
        {copied ? (
          <Check className="size-3.5" />
        ) : (
          <Copy className="size-3.5" />
        )}
        <span>{copied ? "Copied" : "Copy"}</span>
      </span>
    </button>
  );
}

/**
 * Lightweight code block.
 *
 * - Always collapsible (default = collapsed).
 * - During streaming, even when expanded, falls back to a plain `<pre>`
 *   instead of running Prism on every keystroke.
 * - When streaming finishes, the full Prism render kicks in.
 */
function CodeBlockImpl({ language, code }: CodeBlockProps) {
  const streaming = React.useContext(StreamingContext);
  // Collapsed by default while streaming, open by default once finalized.
  const [open, setOpen] = React.useState(false);

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-border bg-[#1e1e1e]">
      <CodeBlockHeader
        language={language}
        code={code}
        open={open}
        toggle={() => setOpen((o) => !o)}
        inProgress={streaming}
      />
      {open && (
        <div className="overflow-x-auto">
          {streaming ? (
            // Streaming: cheap <pre>. No Prism. No tokenization.
            <pre className="m-0 whitespace-pre-wrap break-words p-3 font-mono text-[13px] leading-relaxed text-zinc-200">
              {code}
            </pre>
          ) : (
            // Finalized: full Prism syntax highlighting.
            <SyntaxHighlighter
              language={language || "text"}
              style={oneDark}
              customStyle={{
                margin: 0,
                padding: "0.75rem 1rem",
                background: "transparent",
                fontSize: "0.85rem",
              }}
              PreTag="div"
              wrapLongLines
            >
              {code}
            </SyntaxHighlighter>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Memoized so identical (language, code) pairs short-circuit on every
 * throttled streaming flush. Crucial when the same chunk arrives a
 * couple of times within one render frame.
 */
const CodeBlock = React.memo(
  CodeBlockImpl,
  (prev, next) =>
    prev.language === next.language && prev.code === next.code,
);

/* ─────────────────────────────────────────────────────────────────────────
 * Markdown wrapper
 * ────────────────────────────────────────────────────────────────────── */

const MD_COMPONENTS: Components = {
  img: ({ src, alt }: { src?: string | Blob; alt?: string }) => (
    // Remote and generated Markdown sources are dynamic, so their dimensions
    // and host allow-list are not known ahead of time for next/image.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={typeof src === "string" ? src : undefined}
      alt={alt ?? ""}
      className="my-2 max-h-60 rounded-lg border border-border bg-muted object-contain"
    />
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2.5 last:mb-0">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-2.5 list-disc pl-5 marker:text-muted-foreground">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-2.5 list-decimal pl-5 marker:text-muted-foreground">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="my-1 leading-6">{children}</li>
  ),
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => {
    // Only allow safe URL schemes; block javascript:/data:/vbscript: etc.
    const safe =
      !href ||
      /^(https?:|mailto:|tel:|\/|#|\.)/i.test(href) ||
      !href.includes(":");
    return (
      <a
        href={safe ? href : undefined}
        className="text-primary underline underline-offset-2 hover:opacity-80"
        target="_blank"
        rel="noreferrer"
      >
        {children}
      </a>
    );
  },
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="mb-2 mt-5 text-lg font-semibold tracking-tight first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="mb-2 mt-4 text-base font-semibold tracking-tight first:mt-0">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mb-1.5 mt-3 text-[15px] font-semibold first:mt-0">{children}</h3>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="my-3 border-l-2 border-border pl-4 text-muted-foreground">
      {children}
    </blockquote>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border border-border bg-muted px-3 py-1.5 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border border-border px-3 py-1.5">{children}</td>
  ),
  code: ({ className, children, ...props }) => {
    const match = /language-(\w+)/.exec(className || "");
    const code = String(children).replace(/\n$/, "");
    const isBlock = !!match || code.includes("\n");
    if (isBlock) {
      return <CodeBlock language={match?.[1] || ""} code={code} />;
    }
    return (
      <code
        className="rounded bg-muted/70 px-1 py-0.5 font-mono text-[0.82em] font-normal text-foreground"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => <>{children}</>,
};

const REMARK_PLUGINS = [remarkGfm];

type CompactReference = {
  href: string;
  host: string;
};

function splitReferences(content: string): {
  body: string;
  references: CompactReference[];
} {
  const headingPattern =
    /(?:^|\n)(?:-{3,}\s*\n)?(?:#{1,6}\s*)?(?:\*\*)?(?:Referensi|References|Sumber)(?::)?(?:\*\*)?\s*(?:\n|$)/i;
  const match = headingPattern.exec(content);

  if (!match || match.index === undefined) {
    return { body: content, references: [] };
  }

  const referenceSection = content.slice(match.index + match[0].length);
  const urls = referenceSection.match(/https?:\/\/[^\s)\]>]+/gi) ?? [];
  const seen = new Set<string>();
  const references = urls.flatMap((rawUrl) => {
    const href = rawUrl.replace(/[.,;:]+$/, "");
    if (seen.has(href)) return [];

    try {
      const url = new URL(href);
      seen.add(href);
      return [{ href, host: url.hostname.replace(/^www\./, "") }];
    } catch {
      return [];
    }
  });

  if (references.length === 0) {
    return { body: content, references: [] };
  }

  return {
    body: content.slice(0, match.index).trimEnd(),
    references,
  };
}

function CompactReferences({ references }: { references: CompactReference[] }) {
  return (
    <div
      className="mt-4 flex items-center gap-2 border-t border-border pt-3"
      aria-label="Referensi"
    >
      <span className="text-xs font-medium text-muted-foreground">Sumber</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {references.map((reference, index) => (
          <a
            key={reference.href}
            href={reference.href}
            target="_blank"
            rel="noreferrer"
            title={reference.host}
            aria-label={`Buka sumber ${index + 1} dari ${reference.host}`}
            className="inline-flex size-7 items-center justify-center rounded-full border border-border bg-muted text-[11px] font-semibold text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-foreground hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {index + 1}
          </a>
        ))}
      </div>
    </div>
  );
}

const ReactMarkdownMemo = React.memo(
  function ReactMarkdownInner({ content }: { content: string }) {
    return (
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MD_COMPONENTS}>
        {content}
      </ReactMarkdown>
    );
  },
  (prev, next) => prev.content === next.content,
);

export function Markdown({
  children,
  className,
  streaming = false,
}: {
  children: string;
  className?: string;
  /** When true, child code blocks render cheap `<pre>` instead of Prism. */
  streaming?: boolean;
}) {
  const { body, references } = React.useMemo(
    () => (streaming ? { body: children, references: [] } : splitReferences(children)),
    [children, streaming],
  );

  return (
    <div
      className={cn(
        "prose-chat max-w-none text-[15px] leading-relaxed",
        className,
      )}
    >
      <StreamingContext.Provider value={streaming}>
        <ReactMarkdownMemo content={body} />
      </StreamingContext.Provider>
      {references.length > 0 && <CompactReferences references={references} />}
    </div>
  );
}
