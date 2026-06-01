"use client";

import * as React from "react";
import { ChevronDown, Check } from "lucide-react";
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
};

export function ModelSelector({
  models,
  value,
  onChange,
  variant = "compact",
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
            "absolute z-30 max-h-80 w-72 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg",
            // Show dropdown ABOVE the trigger when compact (it sits at bottom of input)
            variant === "compact"
              ? "bottom-full right-0 mb-2"
              : "top-full left-0 mt-2",
          )}
        >
          {groups.map(([vendor, items]) => (
            <div key={vendor} className="py-1">
              <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {vendor}
              </p>
              {items.map((m) => {
                const active = m.id === value;
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      onChange(m.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                      active && "bg-accent",
                    )}
                  >
                    <Check
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        active ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{m.label}</p>
                      {m.tag && (
                        <p className="truncate text-xs text-muted-foreground">
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
