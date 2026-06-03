"use client";

import * as React from "react";
import { Markdown } from "./markdown";
import { ReasoningBlock } from "./reasoning-block";
import { ToolCall, type ToolCallPart } from "./tool-call";
import { parseReasoningSegments } from "@/lib/chat/parse-reasoning";
import { cn } from "@/lib/utils";

/** A subset of the AI SDK's UIMessagePart that the bubble cares about. */
export type AnyPart =
  | { type: "text"; text: string }
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
};

/** Walk parts and render in order; keep tool calls inline between text. */
function renderParts(parts: AnyPart[], streaming?: boolean) {
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
    // Tool call (static or dynamic)
    return <ToolCall key={p.toolCallId ?? `tc-${idx}`} part={p} />;
  });
}

function MessageBubbleImpl({
  role,
  parts,
  content,
  streaming,
}: MessageBubbleProps) {
  if (role === "system") return null;
  const isUser = role === "user";

  return (
    <div
      className={cn(
        "flex w-full px-4 py-3",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          isUser
            ? "max-w-[min(75%,32rem)] rounded-2xl bg-secondary px-4 py-2.5 text-secondary-foreground"
            : "max-w-[min(85%,48rem)] text-foreground",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
            {content ??
              parts
                ?.map((p) => (p.type === "text" ? p.text : ""))
                .join("") ??
              ""}
          </p>
        ) : parts && parts.length > 0 ? (
          <>
            {renderParts(parts, streaming)}
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
      </div>
    </div>
  );
}

/** Memoized — short-circuits when role/content/streaming/parts are unchanged. */
export const MessageBubble = React.memo(MessageBubbleImpl, (prev, next) => {
  if (prev.role !== next.role) return false;
  if (prev.streaming !== next.streaming) return false;
  if (prev.content !== next.content) return false;
  // Compare parts shallowly via JSON for tool state changes.
  if ((prev.parts ? prev.parts.length : 0) !== (next.parts ? next.parts.length : 0)) {
    return false;
  }
  if (prev.parts && next.parts) {
    return JSON.stringify(prev.parts) === JSON.stringify(next.parts);
  }
  return true;
});
