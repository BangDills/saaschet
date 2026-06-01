"use client";

import * as React from "react";
import { Check, Crown, Loader2, Sparkles } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fireCreditsRefresh } from "@/components/dashboard/credits-meter";

type Tier = "free" | "pro";

const PLANS: Array<{
  id: Tier;
  name: string;
  limit: number;
  price: string;
  icon: React.ComponentType<{ className?: string }>;
  perks: string[];
}> = [
  {
    id: "free",
    name: "Free",
    limit: 50,
    price: "Rp 0 / bulan",
    icon: Sparkles,
    perks: [
      "50 credits per day",
      "All chat models",
      "Agent Mode (read + write GitHub)",
      "Web search & repo connect",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    limit: 1000,
    price: "Demo (no payment)",
    icon: Crown,
    perks: [
      "1,000 credits per day",
      "Everything in Free",
      "Priority for long agent runs",
      "Higher-context responses",
    ],
  },
];

export type ProfileTierSwitcherProps = {
  initialTier: Tier;
  usedToday: number;
};

export function ProfileTierSwitcher({
  initialTier,
  usedToday,
}: ProfileTierSwitcherProps) {
  const [tier, setTier] = React.useState<Tier>(initialTier);
  const [pending, setPending] = React.useState<Tier | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function switchTo(next: Tier) {
    if (next === tier || pending) return;
    setPending(next);
    setError(null);
    try {
      const res = await fetch("/api/profile/tier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: next }),
      });
      const json = (await res.json()) as
        | { ok: true; tier: Tier; dailyLimit: number }
        | { error: string };
      if (!res.ok || "error" in json) {
        setError(
          "error" in json ? json.error : `Switch failed (${res.status})`,
        );
        return;
      }
      setTier(json.tier);
      fireCreditsRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan & credits</CardTitle>
        <p className="text-sm text-muted-foreground">
          Used <span className="font-medium text-foreground">{usedToday}</span>{" "}
          credits today. No payment integration yet — switching tiers takes
          effect immediately for testing.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {PLANS.map((plan) => {
            const isCurrent = tier === plan.id;
            const isPending = pending === plan.id;
            const Icon = plan.icon;
            return (
              <div
                key={plan.id}
                className={cn(
                  "rounded-xl border p-4 transition-colors",
                  isCurrent
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card",
                )}
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon
                      className={cn(
                        "size-5",
                        plan.id === "pro"
                          ? "text-amber-500"
                          : "text-violet-500",
                      )}
                    />
                    <span className="text-base font-semibold">{plan.name}</span>
                  </div>
                  {isCurrent && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                      <Check className="size-3" />
                      Current
                    </span>
                  )}
                </div>

                <p className="mb-1 text-2xl font-bold tracking-tight">
                  {plan.limit.toLocaleString()}{" "}
                  <span className="text-sm font-medium text-muted-foreground">
                    credits / day
                  </span>
                </p>
                <p className="mb-3 text-xs text-muted-foreground">
                  {plan.price}
                </p>

                <ul className="mb-4 space-y-1.5 text-sm">
                  {plan.perks.map((p) => (
                    <li key={p} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => switchTo(plan.id)}
                  disabled={isCurrent || !!pending}
                  className={cn(
                    "inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors",
                    isCurrent
                      ? "cursor-default bg-muted text-muted-foreground"
                      : plan.id === "pro"
                        ? "bg-primary text-primary-foreground hover:opacity-90"
                        : "border border-border bg-card hover:bg-accent",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                  )}
                >
                  {isPending && <Loader2 className="size-4 animate-spin" />}
                  {isCurrent
                    ? "Current plan"
                    : plan.id === "pro"
                      ? "Upgrade to Pro"
                      : "Switch to Free"}
                </button>
              </div>
            );
          })}
        </div>

        {error && (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
