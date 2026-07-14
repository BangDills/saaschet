"use client";

import * as React from "react";
import { ChevronDown, Check, Link, Lock } from "lucide-react";
import type { ModelInfo } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

export type ModelSelectorProps = {
  models: ModelInfo[];
  value: string;
  onChange: (id: string) => void;
  /**
   * "compact" → text + chevron only, used inside the chat input (Kiro style)
   * "default" → bordered card-like button, used elsewhere
   */
  variant?: "compact" | "default";
  /** When true, non-agent-capable models are dimmed. */
  agentMode?: boolean;
  /** Whether the user has connected their OpenAI account. */
  openaiConnected?: boolean;
  /** Callback when user clicks "Connect" on a requiresAuth model. */
  onConnectOpenAI?: () => void;
};

export function ModelSelector({
  models,
  value,
  onChange,
  variant = "compact",
  agentMode = false,
  openaiConnected = false,
  onConnectOpenAI,
}: ModelSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const current = models.find((m) => m.id === value) ?? models[0];

  // Group by vendor for readability
  const groups = React.useMemo(() => {
    const map = new Map<string, ModelInfo[]>();
    for (const m of models) {
      const arr = map.get(m.vendor) ?? [];
      arr.push(m);
      map.set(m.vendor, arr);
    }
    return Array.from(map.entries());
  }, [models]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className={cn(
          variant === "compact"
            ? "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            : "inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent",
        )}
      >
        {variant === "default" && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {current?.vendor ?? "Model"}
          </span>
        )}
        <span className="truncate">
          {current?.label ?? "Select model"}
        </span>
        <ChevronDown className="size-3.5 opacity-70" />
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-30 max-h-[60dvh] w-72 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg sm:max-h-80 sm:w-80",
            // Show dropdown ABOVE the trigger when compact (it sits at bottom of input)
            variant === "compact"
              ? "bottom-full right-0 mb-2"
              : "top-full left-0 mt-2",
          )}
        >
          {agentMode && (
            <div className="mx-2 my-1 rounded-md bg-muted px-2 py-1 text-[10px] text-muted-foreground">
              Agent Mode · compatible models only
            </div>
          )}
          {groups.map(([vendor, items]) => (
            <div key={vendor} className="py-0.5">
              <p className="px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                {vendor}
              </p>
              {items.map((m) => {
                const active = m.id === value;
                const dimmed = agentMode && !m.agentCapable;
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      if (m.requiresAuth && !openaiConnected) {
                        onConnectOpenAI?.();
                        return;
                      }
                      onChange(m.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                      active && "bg-accent",
                      dimmed && "opacity-40",
                    )}
                  >
                    <Check
                      className={cn(
                        "size-3.5 shrink-0",
                        active ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate font-medium">
                        {m.label}
                        {m.free && (
                          <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Free
                          </span>
                        )}
                        {m.requiresAuth && (
                          openaiConnected ? (
                            <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                              <Link className="mr-0.5 inline size-2.5" />
                              Connected
                            </span>
                          ) : (
                            <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-foreground">
                              <Lock className="mr-0.5 inline size-2.5" />
                              Connect
                            </span>
                          )
                        )}
                      </p>
                      {m.tag && (
                        <p className="hidden truncate text-[11px] leading-4 text-muted-foreground sm:block">
                          {m.tag}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
