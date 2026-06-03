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
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

/** Category-based accent colors */
const CATEGORY_COLORS: Record<ToolMeta["category"], string> = {
  read: "text-sky-500 dark:text-sky-400",
  write: "text-violet-500 dark:text-violet-400",
  execute: "text-amber-500 dark:text-amber-400",
  search: "text-emerald-500 dark:text-emerald-400",
  git: "text-rose-500 dark:text-rose-400",
};

const CATEGORY_BG: Record<ToolMeta["category"], string> = {
  read: "bg-sky-500/10",
  write: "bg-violet-500/10",
  execute: "bg-amber-500/10",
  search: "bg-emerald-500/10",
  git: "bg-rose-500/10",
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
  if (typeof obj.path === "string" && obj.path) return obj.path;
  return null;
}

function summarizeInput(toolName: string, input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const obj = input as Record<string, unknown>;
  switch (toolName) {
    case "list_files":
    case "sandbox_list_files":
      return typeof obj.path === "string" ? obj.path || "/" : "/";
    case "read_file":
    case "write_file":
    case "edit_file":
    case "sandbox_read_file":
    case "sandbox_write_file":
      return typeof obj.path === "string" ? obj.path : "";
    case "search_code":
    case "web_search":
      return typeof obj.query === "string" ? `"${obj.query}"` : "";
    case "run_command":
      return typeof obj.command === "string" ? `$ ${obj.command}` : "";
    case "execute_code":
      return "snippet";
    case "create_pull_request":
      return typeof obj.title === "string" ? `"${obj.title}"` : "";
    default:
      return "";
  }
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
    case "read_file":
    case "sandbox_read_file":
      if (typeof obj.length === "number") {
        return `${obj.length.toLocaleString()} chars${obj.truncated ? " (truncated)" : ""}`;
      }
      return "";
    case "search_code":
      return typeof obj.count === "number" ? `${obj.count} matches` : "";
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
};

function ToolCallImpl({ part }: ToolCallProps) {
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

  const accentColor = CATEGORY_COLORS[meta.category];
  const accentBg = CATEGORY_BG[meta.category];

  return (
    <div
      className={cn(
        "my-1.5 rounded-lg border transition-all duration-200",
        isError
          ? "border-red-300/50 bg-red-500/5 dark:border-red-900/40"
          : isRunning
            ? "border-border/60 bg-muted/30"
            : "border-border/40 bg-muted/20 hover:bg-muted/30",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors"
      >
        {/* Expand chevron */}
        <span className="flex size-4 shrink-0 items-center justify-center">
          {open ? (
            <ChevronDown className="size-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3 text-muted-foreground" />
          )}
        </span>

        {/* Icon with category accent */}
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-md",
            accentBg,
          )}
        >
          {isRunning ? (
            <Loader2
              className={cn("size-3.5 animate-spin", accentColor)}
            />
          ) : (
            <Icon className={cn("size-3.5", accentColor)} />
          )}
        </span>

        {/* Label and path */}
        <div className="min-w-0 flex-1">
          <span className="font-medium text-foreground">
            {isRunning ? meta.running : meta.done}
          </span>

          {/* Show file path or input summary */}
          {(filePath || inputSummary) && (
            <span
              className={cn(
                "ml-1.5 font-mono text-[11px]",
                isRunning
                  ? "text-foreground/60"
                  : "text-muted-foreground",
              )}
            >
              {filePath || inputSummary}
            </span>
          )}
        </div>

        {/* Status badge */}
        <span className="flex shrink-0 items-center gap-1">
          {isRunning && (
            <span className="flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-300">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-violet-500 opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-violet-500" />
              </span>
              working
            </span>
          )}
          {isDone && !isError && outputSummary && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <CheckCircle2 className="size-3 text-emerald-500" />
              {outputSummary}
            </span>
          )}
          {isDone && !isError && !outputSummary && (
            <CheckCircle2 className="size-3.5 text-emerald-500" />
          )}
          {isError && (
            <span className="flex items-center gap-1 text-[10px] text-red-500">
              <XCircle className="size-3" />
              error
            </span>
          )}
        </span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-border/40 px-3 py-2.5 text-xs">
          {part.input !== undefined && (
            <DetailSection label="Input" value={part.input} />
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
          "max-h-72 overflow-auto rounded-md bg-background/80 p-2 font-mono text-[11px] leading-relaxed",
          isError && "text-red-700 dark:text-red-300",
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
    JSON.stringify(prev.part.output) === JSON.stringify(next.part.output)
  );
});
