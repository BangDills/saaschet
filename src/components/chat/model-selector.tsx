"use client";

import * as React from "react";
import { ChevronDown, Check, Eye, Sparkles } from "lucide-react";
import type { ModelInfo } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

const LOBE_ICON_BASE =
  "https://unpkg.com/@lobehub/icons-static-svg@latest/icons";

const PROVIDER_LOGOS: Record<string, string> = {
  DeepSeek: `${LOBE_ICON_BASE}/deepseek-color.svg`,
  Kimi: `${LOBE_ICON_BASE}/kimi.svg`,
  GLM: `${LOBE_ICON_BASE}/chatglm-color.svg`,
  Qwen: `${LOBE_ICON_BASE}/qwen-color.svg`,
  MiniMax: `${LOBE_ICON_BASE}/minimax-color.svg`,
};

function ProviderLogo({ vendor }: { vendor: string }) {
  const src = PROVIDER_LOGOS[vendor];

  if (src) {
    return (
      // Brand assets are served from the official Lobe Icons static package.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" className="size-4 shrink-0 object-contain" />
    );
  }

  return (
    <span
      aria-hidden
      className="flex size-4 shrink-0 items-center justify-center rounded border border-border text-[8px] font-bold text-muted-foreground"
    >
      {vendor.slice(0, 1)}
    </span>
  );
}

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
};

export function ModelSelector({
  models,
  value,
  onChange,
  variant = "compact",
  agentMode = false,
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
            "absolute z-30 max-h-72 w-56 overflow-y-auto rounded-xl border border-border bg-card p-1.5 shadow-lg sm:w-60",
            // Show dropdown ABOVE the trigger when compact (it sits at bottom of input)
            variant === "compact"
              ? "bottom-full right-0 mb-2"
              : "top-full left-0 mt-2",
          )}
        >
          {models.map((m) => {
            const active = m.id === value;
            const dimmed = agentMode && !m.agentCapable;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-xs transition-colors hover:bg-accent",
                  active && "bg-accent",
                  dimmed && "opacity-40",
                )}
              >
                <ProviderLogo vendor={m.vendor} />
                <span className="min-w-0 flex-1 truncate font-medium">{m.label}</span>
                {m.agentCapable && (
                  <Sparkles className="size-3 shrink-0 text-violet-500" aria-label="Agent" />
                )}
                {m.multimodal && (
                  <Eye className="size-3 shrink-0 text-muted-foreground" aria-label="Vision" />
                )}
                {m.tag && !active && (
                  <span className="shrink-0 text-[8px] font-medium uppercase text-muted-foreground">
                    {m.tag}
                  </span>
                )}
                {m.free && !active && (
                  <span className="text-[8px] font-semibold uppercase text-muted-foreground">Free</span>
                )}
                <Check
                  className={cn(
                    "size-3.5 shrink-0",
                    active ? "opacity-100" : "hidden",
                  )}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
