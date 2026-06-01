"use client";

import * as React from "react";
import { Bot, User } from "lucide-react";
import { Markdown } from "./markdown";
import { cn } from "@/lib/utils";

export type MessageBubbleProps = {
  role: "user" | "assistant" | "system";
  content: string;
  /** when true, shows a subtle pulsing cursor at the end (streaming) */
  streaming?: boolean;
};

export function MessageBubble({ role, content, streaming }: MessageBubbleProps) {
  if (role === "system") return null;

  const isUser = role === "user";

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
            <Markdown>{content || ""}</Markdown>
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
