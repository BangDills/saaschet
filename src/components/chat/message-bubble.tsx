"use client";

import * as React from "react";
import { Markdown } from "./markdown";
import { ReasoningBlock } from "./reasoning-block";
import { ToolCall, type ToolCallPart } from "./tool-call";
import { parseReasoningSegments } from "@/lib/chat/parse-reasoning";
import { cn } from "@/lib/utils";
import { Check, Copy, RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react";

/** A subset of the AI SDK's UIMessagePart that the bubble cares about. */
export type AnyPart =
  | { type: "text"; text: string }
  | { type: "file"; mediaType: string; url: string; filename?: string }
  | ({ type: `tool-${string}` | "dynamic-tool" } & ToolCallPart);

export type MessageBubbleProps = {
  role: "user" | "assistant" | "system";
  /** When given, renders message parts in order (text + tool calls). Falls
   *  back to `content` for legacy / persisted messages. */
  parts?: AnyPart[];
  /** Plain string fallback. Used when only finalized text is available. */
  content?: string;
  /** when true, shows a subtle pulsing cursor at the end (streaming) */
  streaming?: boolean;
  /** Callback to submit a tool action prompt. */
  onToolActionPrompt?: (text: string) => void;
  /** Retry the preceding user request. */
  onRetry?: () => void;
};

/** Walk parts and render in order; keep tool calls inline between text. */
function renderParts(
  parts: AnyPart[],
  streaming?: boolean,
  onToolActionPrompt?: (text: string) => void,
) {
  return parts.map((p, idx) => {
    if (p.type === "text") {
      // Apply reasoning-tag splitting on assistant text parts.
      const segs = parseReasoningSegments(p.text || "");
      return (
        <React.Fragment key={`t-${idx}`}>
          {segs.map((seg, i) => {
            if (seg.type === "reasoning") {
              return (
                <ReasoningBlock
                  key={`r-${idx}-${i}`}
                  content={seg.content}
                  streaming={streaming}
                  inProgress={!seg.closed}
                />
              );
            }
            return seg.content ? (
              <Markdown key={`m-${idx}-${i}`} streaming={streaming}>
                {seg.content}
              </Markdown>
            ) : null;
          })}
        </React.Fragment>
      );
    }
    if (p.type === "file") {
      if (p.mediaType?.startsWith("image/")) {
        return (
          <div key={`f-${idx}`} className="mt-2 max-w-xs overflow-hidden rounded-lg border border-border bg-muted">
            <img src={p.url} alt={p.filename || "Image attachment"} className="max-h-60 object-contain" />
          </div>
        );
      }
      return null;
    }
    // Tool call (static or dynamic)
    return (
      <ToolCall
        key={p.toolCallId ?? `tc-${idx}`}
        part={p}
        onActionPrompt={onToolActionPrompt}
      />
    );
  });
}

function MessageBubbleImpl({
  role,
  parts,
  content,
  streaming,
  onToolActionPrompt,
  onRetry,
}: MessageBubbleProps) {
  const [copied, setCopied] = React.useState(false);
  const [feedback, setFeedback] = React.useState<"up" | "down" | null>(null);
  if (role === "system") return null;
  const isUser = role === "user";
  const plainText =
    content ?? parts?.map((part) => (part.type === "text" ? part.text : "")).join("") ?? "";

  async function copyMessage() {
    if (!plainText) return;
    await navigator.clipboard.writeText(plainText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className={cn(
        "flex w-full py-4 sm:py-5",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          isUser
            ? "max-w-[85%] rounded-3xl rounded-br-lg bg-secondary px-4 py-3 text-secondary-foreground sm:max-w-[70%]"
            : "w-full max-w-none text-foreground",
        )}
      >
        {isUser ? (
          <div className="flex flex-col gap-2">
            <Markdown className="text-secondary-foreground">
              {content ??
                parts
                  ?.map((p) => (p.type === "text" ? p.text : ""))
                  .join("") ??
                ""}
            </Markdown>
            {parts && parts.length > 0 && (
              <div className="flex flex-col gap-2 mt-1">
                {parts.map((p, idx) => {
                  if (p.type === "file" && p.mediaType?.startsWith("image/")) {
                    return (
                      <div key={idx} className="max-w-xs overflow-hidden rounded-lg border border-border">
                        <img src={p.url} alt={p.filename || "Uploaded image"} className="max-h-60 object-contain" />
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            )}
          </div>
        ) : parts && parts.length > 0 ? (
          <>
            {renderParts(parts, streaming, onToolActionPrompt)}
            {streaming && (
              <span
                aria-hidden
                className="ml-0.5 inline-block size-2 -translate-y-0.5 animate-pulse rounded-full bg-foreground/40 align-middle"
              />
            )}
          </>
        ) : (
          <>
            {parseReasoningSegments(content || "").map((seg, i) => {
              if (seg.type === "reasoning") {
                return (
                  <ReasoningBlock
                    key={i}
                    content={seg.content}
                    streaming={streaming}
                    inProgress={!seg.closed}
                  />
                );
              }
              return seg.content ? (
                <Markdown key={i} streaming={streaming}>
                  {seg.content}
                </Markdown>
              ) : null;
            })}
            {streaming && (
              <span
                aria-hidden
                className="ml-0.5 inline-block size-2 -translate-y-0.5 animate-pulse rounded-full bg-foreground/40 align-middle"
              />
            )}
          </>
        )}
        {!isUser && !streaming && plainText && (
          <div className="mt-2 flex items-center gap-0.5 text-muted-foreground">
            <MessageAction label={copied ? "Copied" : "Copy"} onClick={copyMessage}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </MessageAction>
            {onRetry && (
              <MessageAction label="Retry" onClick={onRetry}>
                <RotateCcw className="size-3.5" />
              </MessageAction>
            )}
            <MessageAction label="Good response" active={feedback === "up"} onClick={() => setFeedback(feedback === "up" ? null : "up")}>
              <ThumbsUp className="size-3.5" />
            </MessageAction>
            <MessageAction label="Poor response" active={feedback === "down"} onClick={() => setFeedback(feedback === "down" ? null : "down")}>
              <ThumbsDown className="size-3.5" />
            </MessageAction>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageAction({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-muted hover:text-foreground",
        active && "bg-muted text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** Memoized — short-circuits when role/content/streaming/parts are unchanged. */
export const MessageBubble = React.memo(MessageBubbleImpl, (prev, next) => {
  if (prev.role !== next.role) return false;
  if (prev.streaming !== next.streaming) return false;
  if (prev.content !== next.content) return false;
  if (prev.onToolActionPrompt !== next.onToolActionPrompt) return false;
  if (prev.onRetry !== next.onRetry) return false;
  // Compare parts shallowly via JSON for tool state changes.
  if ((prev.parts ? prev.parts.length : 0) !== (next.parts ? next.parts.length : 0)) {
    return false;
  }
  if (prev.parts && next.parts) {
    return JSON.stringify(prev.parts) === JSON.stringify(next.parts);
  }
  return true;
});
