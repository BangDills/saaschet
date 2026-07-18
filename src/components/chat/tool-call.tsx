"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronRight,
  Code2,
  FileCode,
  FileText,
  Folder,
  FolderOpen,
  GitPullRequest,
  Globe,
  Loader2,
  PencilLine,
  Play,
  Search,
  Terminal,
  Wrench,
  XCircle,
  BookOpen,
  Network,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { redactVendorPath } from "@/lib/url";

export type ToolCallPart = {
  type: string; // "tool-list_files", "tool-read_file", "dynamic-tool", etc.
  toolCallId: string;
  toolName?: string;
  state:
    | "input-streaming"
    | "input-available"
    | "approval-requested"
    | "executing"
    | "output-available"
    | "output-error"
    | string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

/** Tool display metadata: rich labels for each state. */
type ToolMeta = {
  /** Icon component */
  Icon: React.ComponentType<{ className?: string }>;
  /** Present tense label (while running) */
  running: string;
  /** Past tense label (when done) */
  done: string;
  /** Category for visual grouping */
  category: "read" | "write" | "execute" | "search" | "git";
};

const TOOL_META: Record<string, ToolMeta> = {
  // GitHub tools
  list_files: {
    Icon: FolderOpen,
    running: "Exploring files…",
    done: "Explored files",
    category: "read",
  },
  read_file: {
    Icon: FileText,
    running: "Reading file…",
    done: "Read file",
    category: "read",
  },
  search_code: {
    Icon: Search,
    running: "Searching codebase…",
    done: "Searched codebase",
    category: "search",
  },
  web_search: {
    Icon: Globe,
    running: "Searching the web…",
    done: "Searched the web",
    category: "search",
  },
  context7_search_library: {
    Icon: BookOpen,
    running: "Searching Context7…",
    done: "Searched Context7",
    category: "search",
  },
  context7_get_docs: {
    Icon: BookOpen,
    running: "Reading docs…",
    done: "Read docs",
    category: "read",
  },
  serena_list_tools: {
    Icon: Network,
    running: "Checking Serena…",
    done: "Checked Serena",
    category: "search",
  },
  serena_call_tool: {
    Icon: Network,
    running: "Using Serena…",
    done: "Used Serena",
    category: "read",
  },
  write_file: {
    Icon: FileCode,
    running: "Writing file…",
    done: "Wrote file",
    category: "write",
  },
  edit_file: {
    Icon: PencilLine,
    running: "Editing file…",
    done: "Edited file",
    category: "write",
  },
  create_pull_request: {
    Icon: GitPullRequest,
    running: "Creating pull request…",
    done: "Created pull request",
    category: "git",
  },

  // Sandbox tools
  run_command: {
    Icon: Terminal,
    running: "Running command…",
    done: "Ran command",
    category: "execute",
  },
  execute_code: {
    Icon: Play,
    running: "Executing code…",
    done: "Executed code",
    category: "execute",
  },
  sandbox_read_file: {
    Icon: FileText,
    running: "Reading file…",
    done: "Read file",
    category: "read",
  },
  sandbox_write_file: {
    Icon: Code2,
    running: "Writing code…",
    done: "Wrote code",
    category: "write",
  },
  sandbox_write_files: {
    Icon: Code2,
    running: "Writing files…",
    done: "Wrote files",
    category: "write",
  },
  sandbox_list_files: {
    Icon: Folder,
    running: "Listing files…",
    done: "Listed files",
    category: "read",
  },
};

const FALLBACK_META: ToolMeta = {
  Icon: Wrench,
  running: "Working…",
  done: "Completed",
  category: "execute",
};

function getToolName(part: ToolCallPart): string {
  if (part.toolName) return part.toolName;
  // type is "tool-<name>" or "dynamic-tool"
  if (part.type.startsWith("tool-")) return part.type.slice(5);
  return part.toolName ?? "tool";
}

function extractFilePath(toolName: string, input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  if (typeof obj.path === "string" && obj.path) return redactVendorPath(obj.path);
  return null;
}

function summarizeInput(toolName: string, input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const obj = input as Record<string, unknown>;
  switch (toolName) {
    case "list_files":
    case "sandbox_list_files":
      return typeof obj.path === "string" ? redactVendorPath(obj.path) || "/" : "/";
    case "read_file":
    case "write_file":
    case "edit_file":
    case "sandbox_read_file":
    case "sandbox_write_file":
      return typeof obj.path === "string" ? redactVendorPath(obj.path) : "";
    case "sandbox_write_files": {
      const files = Array.isArray(obj.files) ? obj.files : [];
      if (files.length === 0) return "";
      if (files.length === 1) return files[0]?.path ?? "1 file";
      return `${files.length} files`;
    }
    case "search_code":
    case "web_search":
      return typeof obj.query === "string" ? `"${obj.query}"` : "";
    case "context7_search_library":
      return typeof obj.libraryName === "string" ? obj.libraryName : "";
    case "context7_get_docs":
      return typeof obj.libraryId === "string" ? obj.libraryId : "";
    case "serena_call_tool":
      return typeof obj.toolName === "string" ? obj.toolName : "";
    case "run_command":
      return typeof obj.command === "string" ? `$ ${redactVendorPath(obj.command)}` : "";
    case "execute_code":
      return "snippet";
    case "create_pull_request":
      return typeof obj.title === "string" ? `"${obj.title}"` : "";
    default:
      return "";
  }
}

type ReadFileOutputMeta = {
  truncated: boolean;
  nextOffset: number | null;
  offset: number;
  limit: number;
  length: number;
  totalLength: number;
};

function getReadFileOutputMeta(output: unknown): ReadFileOutputMeta | null {
  if (!output || typeof output !== "object") return null;
  const obj = output as Record<string, unknown>;

  // Must have truncated and length at minimum
  if (typeof obj.truncated !== "boolean" || typeof obj.length !== "number") {
    return null;
  }

  const offset = typeof obj.offset === "number" ? obj.offset : 0;
  const limit = typeof obj.limit === "number" ? obj.limit : 60_000;
  const totalLength = typeof obj.total_length === "number" ? obj.total_length : obj.length;
  const nextOffset = typeof obj.next_offset === "number" ? obj.next_offset : null;

  return {
    truncated: obj.truncated,
    nextOffset,
    offset,
    limit,
    length: obj.length,
    totalLength,
  };
}

function summarizeOutput(toolName: string, output: unknown): string {
  if (!output || typeof output !== "object") return "";
  const obj = output as Record<string, unknown>;
  if ("error" in obj && typeof obj.error === "string") {
    return `error: ${obj.error}`;
  }
  switch (toolName) {
    case "list_files":
    case "sandbox_list_files":
      return typeof obj.count === "number" ? `${obj.count} entries` : "";
    case "read_file": {
      const meta = getReadFileOutputMeta(output);
      if (meta) {
        if (meta.truncated) {
          const suffix = meta.nextOffset !== null ? `, next page from ${meta.nextOffset.toLocaleString()}` : "";
          if (meta.totalLength > meta.length) {
            return `${meta.length.toLocaleString()} of ${meta.totalLength.toLocaleString()} chars${suffix}`;
          }
          return `${meta.length.toLocaleString()} chars (truncated)${suffix}`;
        }
        return `${meta.length.toLocaleString()} chars`;
      }
      if (typeof obj.length === "number") {
        return `${obj.length.toLocaleString()} chars${obj.truncated ? " (truncated)" : ""}`;
      }
      return "";
    }
    case "sandbox_read_file":
      if (typeof obj.length === "number") {
        return `${obj.length.toLocaleString()} chars${obj.truncated ? " (truncated)" : ""}`;
      }
      return "";
    case "search_code":
      return typeof obj.count === "number" ? `${obj.count} matches` : "";
    case "context7_search_library":
      return typeof obj.count === "number" ? `${obj.count} libraries` : "";
    case "context7_get_docs":
      if (typeof obj.length === "number") {
        return `${obj.length.toLocaleString()} chars${obj.truncated ? " (truncated)" : ""}`;
      }
      return "";
    case "serena_list_tools":
      return typeof obj.count === "number" ? `${obj.count} tools` : "";
    case "serena_call_tool":
      if (typeof obj.length === "number") {
        return `${obj.length.toLocaleString()} chars${obj.truncated ? " (truncated)" : ""}`;
      }
      return "";
    case "write_file":
    case "sandbox_write_file":
      if (typeof obj.commit_sha === "string") {
        return `committed to ${obj.branch}`;
      }
      if (typeof obj.success === "boolean") {
        return obj.success ? "saved" : "failed";
      }
      return "";
    case "edit_file":
      if (typeof obj.commit_sha === "string") {
        const delta =
          typeof obj.bytes_changed === "number"
            ? ` · ${obj.bytes_changed} bytes`
            : "";
        return `committed to ${obj.branch}${delta}`;
      }
      return "";
    case "run_command":
      if (typeof obj.exitCode === "number") {
        return obj.exitCode === 0 ? "success" : `exit ${obj.exitCode}`;
      }
      return "";
    case "execute_code":
      if (typeof obj.exitCode === "number") {
        return obj.exitCode === 0 ? "ran successfully" : `exit ${obj.exitCode}`;
      }
      return "";
    case "create_pull_request":
      return typeof obj.url === "string" ? `PR #${obj.number ?? "?"}` : "";
    default:
      return "";
  }
}

function getLineStats(output: unknown): { added: number; deleted: number } | null {
  if (!output || typeof output !== "object") return null;
  const value = output as Record<string, unknown>;
  const added = typeof value.lines_added === "number" ? value.lines_added : null;
  const deleted = typeof value.lines_deleted === "number" ? value.lines_deleted : null;
  return added !== null && deleted !== null ? { added, deleted } : null;
}

/** Pretty-print JSON for the expanded panel. */
function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export type ToolCallProps = {
  part: ToolCallPart;
  onActionPrompt?: (text: string) => void;
};

function ReadFileTruncationNotice({
  path,
  meta,
  onActionPrompt,
}: {
  path: string | null;
  meta: ReadFileOutputMeta;
  onActionPrompt?: (text: string) => void;
}) {
  const [copied, setCopied] = React.useState(false);

  const nextOffset = meta.nextOffset ?? meta.offset + meta.length;
  const limit = meta.limit ?? 60_000;

  const payload = {
    path: path || "",
    offset: nextOffset,
    limit,
  };

  const copyText = JSON.stringify(payload, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn("Failed to copy", err);
    }
  };

  const handleReadNext = () => {
    if (!onActionPrompt || !path) return;
    const promptText = `Please read the next page of this file using read_file with these parameters: ${JSON.stringify(payload)}`;
    onActionPrompt(promptText);
  };

  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="font-medium text-foreground">
            This file was truncated.
          </p>
          <p>
            Only the first {meta.length.toLocaleString()} characters (from offset {meta.offset.toLocaleString()}) were loaded out of {meta.totalLength.toLocaleString()} total characters.
          </p>
          <p className="mt-1">
            To read the next page, use:
          </p>
          <pre className="mt-1.5 overflow-x-auto rounded bg-background p-1.5 font-mono text-[10px] text-foreground">
            read_file({copyText.replace(/\n\s*/g, " ")})
          </pre>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
          {onActionPrompt && path && (
            <button
              type="button"
              onClick={handleReadNext}
              className="flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-foreground transition-colors hover:bg-muted"
            >
              <ChevronRight className="size-3" />
              <span>Read next page</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              "flex items-center gap-1 rounded border border-border px-2 py-1 transition-colors hover:bg-accent hover:text-accent-foreground",
              copied && "border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-300",
            )}
          >
            {copied ? (
              <>
                <Check className="size-3" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="size-3" />
                <span>Copy params</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToolCallImpl({ part, onActionPrompt }: ToolCallProps) {
  const [open, setOpen] = React.useState(false);
  const toolName = getToolName(part);
  const meta = TOOL_META[toolName] ?? FALLBACK_META;
  const Icon = meta.Icon;

  const isRunning =
    part.state === "input-streaming" ||
    part.state === "input-available" ||
    part.state === "executing";
  const isError = part.state === "output-error" || !!part.errorText;
  const isDone = part.state === "output-available";

  const filePath = extractFilePath(toolName, part.input);
  const inputSummary = summarizeInput(toolName, part.input);
  const outputSummary = isDone ? summarizeOutput(toolName, part.output) : "";
  // Collapsed state: hide shell-command/code previews inline. File paths
  // (labels) stay; the full command/code is shown only when expanded.
  const hideInlinePreview =
    toolName === "run_command" || toolName === "execute_code";
  const inlinePreview = hideInlinePreview ? "" : (filePath || inputSummary);
  const lineStats = isDone ? getLineStats(part.output) : null;

  const readFileMeta =
    isDone && toolName === "read_file"
      ? getReadFileOutputMeta(part.output)
      : null;

  return (
    <div className="my-1 text-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group flex min-h-9 w-full items-center gap-2 overflow-hidden rounded-md px-1 py-1.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
          {isRunning ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : isError ? (
            <XCircle className="size-4 text-destructive" aria-hidden="true" />
          ) : (
            <Icon className="size-4" aria-hidden="true" />
          )}
        </span>

        <div className="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden">
          <span className={cn("shrink-0 font-medium", isError ? "text-destructive" : "text-foreground")}>
            {isError ? `${meta.done} failed` : isRunning ? meta.running : meta.done}
          </span>
          {!open && inlinePreview ? (
            <span className="min-w-0 truncate text-muted-foreground" title={inlinePreview}>
              {inlinePreview}
            </span>
          ) : null}
        </div>

        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {lineStats && (
            <span className="font-mono font-medium">
              <span className="text-emerald-600">+{lineStats.added}</span>
              <span aria-hidden="true"> / </span>
              <span className="text-red-600">-{lineStats.deleted}</span>
            </span>
          )}
          {isDone && !isError && !lineStats && outputSummary && (
            <span className="hidden max-w-28 truncate sm:inline" title={outputSummary}>
              {outputSummary}
            </span>
          )}
          {open ? (
            <ChevronDown className="size-3.5" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-3.5" aria-hidden="true" />
          )}
        </span>
      </button>

      {open && (
        <div className="ml-7 space-y-3 border-l border-border py-2 pl-3 text-xs">
          {part.input !== undefined && (
            <DetailSection label="Input" value={part.input} />
          )}
          {readFileMeta?.truncated && (
            <ReadFileTruncationNotice
              path={filePath}
              meta={readFileMeta}
              onActionPrompt={onActionPrompt}
            />
          )}
          {isError && part.errorText && (
            <DetailSection label="Error" value={part.errorText} isError />
          )}
          {isDone && part.output !== undefined && (
            <DetailSection label="Output" value={part.output} />
          )}
        </div>
      )}
    </div>
  );
}

function DetailSection({
  label,
  value,
  isError,
}: {
  label: string;
  value: unknown;
  isError?: boolean;
}) {
  const text = typeof value === "string" ? value : prettyJson(value);
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <pre
        className={cn(
          "max-h-72 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground",
          isError && "text-destructive",
        )}
      >
        {text}
      </pre>
    </div>
  );
}

export const ToolCall = React.memo(ToolCallImpl, (prev, next) => {
  return (
    prev.part.toolCallId === next.part.toolCallId &&
    prev.part.state === next.part.state &&
    prev.part.errorText === next.part.errorText &&
    prev.onActionPrompt === next.onActionPrompt &&
    JSON.stringify(prev.part.input) === JSON.stringify(next.part.input) &&
    JSON.stringify(prev.part.output) === JSON.stringify(next.part.output)
  );
});
