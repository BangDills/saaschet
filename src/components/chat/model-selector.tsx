"use client";

import * as React from "react";
import { Check, ChevronDown, Eye } from "lucide-react";
import type { ModelInfo } from "@/lib/chat/types";
import { cn } from "@/lib/utils";
import { ModelIcon, type ModelIconName } from "@/components/model-icon";

/** Bundled brand icons (no CDN fetch — see @/components/model-icon). */
const VENDOR_ICONS: Record<string, ModelIconName> = {
  GLM: "chatglm",
  Kimi: "kimi",
  DeepSeek: "deepseek",
  Qwen: "qwen",
  MiniMax: "minimax",
};

function ProviderLogo({ vendor }: { vendor: string }) {
  const name = VENDOR_ICONS[vendor];

  if (name) {
    return (
      <span aria-hidden className="flex size-4 shrink-0 items-center justify-center">
        <ModelIcon name={name} size={16} />
      </span>
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
        {/* Mobile: only the vendor logo + chevron — the vendor badge and full
            label used to render at every breakpoint, which is what collided
            with the repo chip on narrow screens. The full label returns at
            ≥sm. */}
        <span className="sm:hidden">
          <ProviderLogo vendor={current?.vendor ?? ""} />
        </span>
        {variant === "default" && (
          <span className="hidden rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground sm:inline">
            {current?.vendor ?? "Model"}
          </span>
        )}
        <span className="hidden truncate sm:inline">
          {current?.label ?? "Select model"}
        </span>
        <ChevronDown className="size-3.5 opacity-70" />
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-30 max-h-80 w-60 overflow-y-auto rounded-xl border border-border bg-card p-1.5 shadow-lg sm:w-64",
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
                  "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent",
                  active && "bg-accent",
                  dimmed && "opacity-40",
                )}
              >
                <ProviderLogo vendor={m.vendor} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{m.label}</span>
                  {/* Spell the capability out — the icon-only tags read as
                      mystery glyphs in testing. */}
                  {m.tag && (
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {m.tag}
                      {m.multimodal ? " · Vision" : ""}
                    </span>
                  )}
                </span>
                {m.multimodal && !m.tag && (
                  <span title="Bisa membaca gambar" className="flex shrink-0 text-muted-foreground">
                    <Eye className="size-3.5" aria-hidden="true" />
                    <span className="sr-only">Bisa membaca gambar</span>
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
