"use client";

import * as React from "react";
import { Bot, User } from "lucide-react";
import { Markdown } from "./markdown";
import { ReasoningBlock } from "./reasoning-block";
import { parseReasoningSegments } from "@/lib/chat/parse-reasoning";
import { cn } from "@/lib/utils";

export type MessageBubbleProps = {
  role: "user" | "assistant" | "system";
  content: string;
  /** when true, shows a subtle pulsing cursor at the end (streaming) */
  streaming?: boolean;
};

function MessageBubbleImpl({ role, content, streaming }: MessageBubbleProps) {
  if (role === "system") return null;
  const isUser = role === "user";

  // Parse reasoning out of assistant messages so long <think> blocks live
  // inside a collapsible component. For user messages we just render text.
  const segments = React.useMemo(
    () => (isUser ? null : parseReasoningSegments(content || "")),
    [isUser, content],
  );

  return (
    <div className={cn("flex w-full gap-3 px-4 py-4", isUser && "justify-end")}>
      {!isUser && (
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-foreground">
          <Bot className="size-4" />
        </div>
      )}

      <div
        className={cn(
          "max-w-[min(85%,48rem)] rounded-2xl px-4 py-3",
          isUser
            ? "bg-primary text-primary-foreground"
            : "border border-border bg-card text-card-foreground",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
            {content}
          </p>
        ) : (
          <>
            {segments?.map((seg, i) => {
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
                <Markdown key={i}>{seg.content}</Markdown>
              ) : null;
            })}
            {streaming && (
              <span
                aria-hidden
                className="ml-0.5 inline-block size-2 -translate-y-0.5 animate-pulse rounded-full bg-foreground/60 align-middle"
              />
            )}
          </>
        )}
      </div>

      {isUser && (
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <User className="size-4" />
        </div>
      )}
    </div>
  );
}

/**
 * Memoized bubble — re-renders only when its props actually change. This
 * stops the entire message list from re-rendering on every streamed
 * token; only the *last* bubble (whose `content` is changing) updates.
 */
export const MessageBubble = React.memo(MessageBubbleImpl, (prev, next) => {
  return (
    prev.role === next.role &&
    prev.content === next.content &&
    prev.streaming === next.streaming
  );
});
