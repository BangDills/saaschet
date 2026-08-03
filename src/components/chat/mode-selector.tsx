"use client";

import * as React from "react";
import { Check, ChevronDown, ClipboardList, ShieldQuestion, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TurnMode } from "@/lib/chat/mode";

export type ModeSelectorProps = {
  turnMode: TurnMode;
  onChange: (next: TurnMode) => void;
  /** Agent mode (repo + agent-capable model). Plan only makes sense there. */
  agentMode: boolean;
};

/**
 * Plan / Execute mode picker, sitting just left of the model pill next to the
 * send button. Two dimensions, two compact dropdowns would be heavy, so it's
 * one menu of three concrete states:
 *
 *  - **Plan** — read-only; the agent explores and proposes a plan.
 *  - **Execute · Auto** — full read+write, no confirmation.
 *  - **Execute · Tanya dulu** — full tools, but each write waits for approval.
 *
 * When not in agent mode the control is inert (Plan has no repo to plan
 * against); it still reflects the current mode so switching back is instant.
 */
export function ModeSelector({ turnMode, onChange, agentMode }: ModeSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isPlan = turnMode.phase === "plan";
  const isAsk = turnMode.phase === "execute" && turnMode.exec === "ask";

  const label = isPlan ? "Plan" : isAsk ? "Tanya dulu" : "Auto";
  const Icon = isPlan ? ClipboardList : isAsk ? ShieldQuestion : Zap;

  const options: Array<{
    key: string;
    label: string;
    desc: string;
    icon: React.ComponentType<{ className?: string }>;
    value: TurnMode;
  }> = [
    {
      key: "plan",
      label: "Plan",
      desc: "Agent hanya membaca & menyusun rencana",
      icon: ClipboardList,
      value: { phase: "plan", exec: "auto" },
    },
    {
      key: "auto",
      label: "Eksekusi · Auto",
      desc: "Langsung kerjakan tanpa konfirmasi",
      icon: Zap,
      value: { phase: "execute", exec: "auto" },
    },
    {
      key: "ask",
      label: "Eksekusi · Tanya dulu",
      desc: "Setiap aksi tulis menunggu persetujuan Anda",
      icon: ShieldQuestion,
      value: { phase: "execute", exec: "ask" },
    },
  ];

  const active = isPlan ? "plan" : isAsk ? "ask" : "auto";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        disabled={!agentMode}
        title={
          agentMode
            ? `Mode: ${label}`
            : "Mode Plan/Eksekusi aktif saat repo terhubung"
        }
        aria-expanded={open}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors",
          isPlan
            ? "border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
            : isAsk
              ? "border border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          !agentMode && "cursor-not-allowed opacity-50",
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span className="hidden sm:inline">{label}</span>
        <ChevronDown className="hidden size-3 opacity-70 sm:block" />
      </button>

      {open && (
        <div className="absolute bottom-full right-0 z-50 mb-2 w-64 overflow-hidden rounded-xl border border-border bg-card p-1.5 text-card-foreground shadow-xl">
          {options.map((opt) => {
            const OptIcon = opt.icon;
            const isActive = active === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent",
                  isActive && "bg-accent",
                )}
              >
                <OptIcon className="mt-0.5 size-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium">{opt.label}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {opt.desc}
                  </span>
                </span>
                {isActive && (
                  <Check className="ml-auto size-4 shrink-0 text-primary" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
