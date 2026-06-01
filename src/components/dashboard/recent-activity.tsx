"use client";

import {
  Bot,
  GitPullRequest,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type RecentItem = {
  id: string;
  kind: "chat" | "agent";
  cost: number;
  modelId: string | null;
  toolCount: number;
  createdAt: number;
  conversationTitle: string | null;
};

function fmtRelative(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function shortModel(modelId: string | null): string {
  if (!modelId) return "model";
  return modelId
    .replace(/^anthropic-/, "")
    .replace(/^openai-/, "")
    .replace(/-instruct$/, "")
    .replace(/-distill-llama-70b$/, "-distill");
}

export function RecentActivity({ items }: { items: RecentItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <div className="flex size-10 items-center justify-center rounded-full border border-border bg-muted">
          <Sparkles className="size-4 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">No activity yet</p>
        <p className="text-xs text-muted-foreground">
          Send your first chat to see it appear here.
        </p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {items.map((item) => {
        const Icon = item.kind === "agent" ? Bot : MessageSquare;
        const tone =
          item.kind === "agent"
            ? "text-violet-500"
            : "text-muted-foreground";
        return (
          <li
            key={item.id}
            className="flex items-center gap-3 px-1 py-3 text-sm"
          >
            <div
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card",
                tone,
              )}
            >
              <Icon className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {item.conversationTitle ?? "Untitled chat"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {shortModel(item.modelId)}
                {item.kind === "agent" && item.toolCount > 0 && (
                  <>
                    {" · "}
                    <GitPullRequest className="-mt-0.5 inline size-3" />{" "}
                    {item.toolCount} tool{item.toolCount === 1 ? "" : "s"}
                  </>
                )}
                {" · "}
                {fmtRelative(item.createdAt)}
              </p>
            </div>
            <div className="shrink-0 rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium tabular-nums">
              {item.cost} cr
            </div>
          </li>
        );
      })}
    </ul>
  );
}
