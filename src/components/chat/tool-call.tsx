"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  GitPullRequest,
  Globe,
  Loader2,
  PencilLine,
  Search,
  Wrench,
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

const TOOL_META: Record<
  string,
  { label: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  list_files: { label: "Listed files", Icon: Folder },
  read_file: { label: "Read file", Icon: FileText },
  search_code: { label: "Searched code", Icon: Search },
  web_search: { label: "Searched web", Icon: Globe },
  write_file: { label: "Edited file", Icon: PencilLine },
  create_pull_request: { label: "Opened pull request", Icon: GitPullRequest },
};

function getToolName(part: ToolCallPart): string {
  if (part.toolName) return part.toolName;
  // type is "tool-<name>" or "dynamic-tool"
  if (part.type.startsWith("tool-")) return part.type.slice(5);
  return part.toolName ?? "tool";
}

function summarizeInput(toolName: string, input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const obj = input as Record<string, unknown>;
  switch (toolName) {
    case "list_files":
      return typeof obj.path === "string"
        ? obj.path || "/"
        : "";
    case "read_file":
    case "write_file":
      return typeof obj.path === "string" ? obj.path : "";
    case "search_code":
    case "web_search":
      return typeof obj.query === "string" ? `"${obj.query}"` : "";
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
      return typeof obj.count === "number" ? `${obj.count} entries` : "";
    case "read_file":
      if (typeof obj.length === "number") {
        return `${obj.length.toLocaleString()} chars${obj.truncated ? " (truncated)" : ""}`;
      }
      return "";
    case "search_code":
      return typeof obj.count === "number" ? `${obj.count} matches` : "";
    case "write_file":
      if (typeof obj.commit_sha === "string") {
        return `committed to ${obj.branch}`;
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
  const meta = TOOL_META[toolName] ?? { label: toolName, Icon: Wrench };
  const Icon = meta.Icon;

  const isRunning =
    part.state === "input-streaming" ||
    part.state === "input-available" ||
    part.state === "executing";
  const isError = part.state === "output-error" || !!part.errorText;
  const isDone = part.state === "output-available";

  const summary = isDone
    ? summarizeOutput(toolName, part.output) ||
      summarizeInput(toolName, part.input)
    : summarizeInput(toolName, part.input);

  return (
    <div
      className={cn(
        "my-2 rounded-lg border border-border bg-muted/40",
        isError && "border-red-300 dark:border-red-900/60",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted"
      >
        {open ? (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        {isRunning ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-violet-500" />
        ) : (
          <Icon
            className={cn(
              "size-3.5 shrink-0",
              isError ? "text-red-500" : "text-muted-foreground",
            )}
          />
        )}
        <span>{isRunning ? "Running" : meta.label}</span>
        {summary && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="truncate font-mono text-[11px] font-normal text-muted-foreground">
              {summary}
            </span>
          </>
        )}
      </button>

      {open && (
        <div className="space-y-2 border-t border-border p-3 text-xs">
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
          "max-h-72 overflow-auto rounded-md bg-background p-2 font-mono text-[11px] leading-relaxed",
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
