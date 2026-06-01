"use client";

import * as React from "react";
import { Check, ChevronDown, GitBranch } from "lucide-react";
import { contextPresets } from "@/lib/chat/contexts";
import { cn } from "@/lib/utils";

export type ContextSelectorProps = {
  value: string;
  onChange: (id: string) => void;
};

export function ContextSelector({ value, onChange }: ContextSelectorProps) {
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

  const current = contextPresets.find((c) => c.id === value) ?? contextPresets[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        title="Select context"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
          "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        )}
      >
        <GitBranch className="size-4" />
        <span>{current.label}</span>
        <ChevronDown className="size-3 opacity-70" />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-2 w-72 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-lg">
          <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Persona / Context
          </p>
          {contextPresets.map((c) => {
            const active = c.id === value;
            return (
              <button
                key={c.id}
                onClick={() => {
                  onChange(c.id);
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
                  <p className="truncate font-medium">{c.label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
