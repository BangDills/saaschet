"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

function CodeBlock({
  language,
  code,
}: {
  language: string;
  code: string;
}) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="relative my-3 overflow-hidden rounded-lg border border-border bg-[#1e1e1e]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5 text-xs">
        <span className="font-mono text-zinc-400">{language || "text"}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1 rounded text-zinc-400 transition-colors hover:text-zinc-100"
          aria-label="Copy code"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
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
    </div>
  );
}

export function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "prose-chat max-w-none text-[15px] leading-relaxed",
        className,
      )}
    >
      <ReactMarkdownMemo content={children} />
    </div>
  );
}

/**
 * Memoized Markdown renderer. When the same `content` arrives twice
 * (e.g. during throttled streaming flush) we skip the parse + render.
 */
const ReactMarkdownMemo = React.memo(
  function ReactMarkdownInner({ content }: { content: string }) {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          ul: ({ children }) => (
            <ul className="mb-3 list-disc space-y-1 pl-6">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 list-decimal space-y-1 pl-6">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          a: ({ children, href }) => (
            <a
              href={href}
              className="text-primary underline underline-offset-2 hover:opacity-80"
              target="_blank"
              rel="noreferrer"
            >
              {children}
            </a>
          ),
          h1: ({ children }) => (
            <h1 className="mb-3 mt-4 text-xl font-bold">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-4 text-lg font-bold">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-3 text-base font-semibold">{children}</h3>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-2 border-border pl-4 text-muted-foreground">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border bg-muted px-3 py-1.5 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
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
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {content}
      </ReactMarkdown>
    );
  },
  (prev, next) => prev.content === next.content,
);

/**
 * Memoized code block — same Prism instance is otherwise re-mounted on
 * every parent re-render, which is what triggers the worst lag spikes.
 */
const MemoCodeBlock = React.memo(
  function MemoCodeBlockInner({
    language,
    code,
  }: {
    language: string;
    code: string;
  }) {
    return <CodeBlock language={language} code={code} />;
  },
  (prev, next) => prev.code === next.code && prev.language === next.language,
);
// (We keep MemoCodeBlock declared for future use; the components map above
// passes through CodeBlock directly, but inside ReactMarkdownMemo's render
// the entire tree is already memoized at the parent level.)
void MemoCodeBlock;
