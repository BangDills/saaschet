"use client";

import * as React from "react";
import {
  Check,
  Crown,
  Loader2,
  Sparkles,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fireCreditsRefresh } from "./credits-meter";

type Tier = "free" | "pro";

type Props = {
  currentTier: Tier;
  usedToday: number;
  dailyLimit: number;
  remaining: number;
  resetsAt: number;
  totalUsed: number;
};

const PLANS: {
  tier: Tier;
  name: string;
  price: string;
  description: string;
  limit: number;
  features: string[];
  icon: React.ReactNode;
  accent: string;
}[] = [
  {
    tier: "free",
    name: "Free",
    price: "$0",
    description: "Great for trying out SaaSchet",
    limit: 50,
    features: [
      "50 credits per day",
      "AI Chat with all models",
      "Web search integration",
      "GitHub repo context",
      "Basic agent mode",
      "Chat history",
    ],
    icon: <Sparkles className="size-6" />,
    accent: "from-sky-500 to-blue-600",
  },
  {
    tier: "pro",
    name: "Pro",
    price: "$19",
    description: "For power users and teams",
    limit: 1000,
    features: [
      "1,000 credits per day",
      "AI Chat with all models",
      "Web search integration",
      "GitHub repo context",
      "Full agent mode (read + write + PR)",
      "Priority support",
      "Chat history",
      "Usage analytics",
    ],
    icon: <Crown className="size-6" />,
    accent: "from-amber-500 to-orange-600",
  },
];

function fmtResetsIn(resetsAt: number): string {
  const ms = Math.max(0, resetsAt - Date.now());
  const totalMins = Math.round(ms / 60_000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function SubscriptionPlans({
  currentTier,
  usedToday,
  dailyLimit,
  remaining,
  resetsAt,
  totalUsed,
}: Props) {
  const [switching, setSwitching] = React.useState(false);
  const [activeTier, setActiveTier] = React.useState<Tier>(currentTier);

  async function switchTier(newTier: Tier) {
    if (newTier === activeTier || switching) return;
    setSwitching(true);
    try {
      const res = await fetch("/api/profile/tier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: newTier }),
      });
      if (res.ok) {
        setActiveTier(newTier);
        fireCreditsRefresh();
      }
    } catch {
      // ignore
    } finally {
      setSwitching(false);
    }
  }

  const pct = Math.min(100, Math.round((usedToday / dailyLimit) * 100));

  return (
    <div className="space-y-6">
      {/* Current usage card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="size-5 text-violet-500" />
            Today&apos;s Usage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Used today</p>
              <p className="text-2xl font-bold tabular-nums">{usedToday}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Remaining</p>
              <p className="text-2xl font-bold tabular-nums">{remaining}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">All-time total</p>
              <p className="text-2xl font-bold tabular-nums">
                {totalUsed.toLocaleString()}
              </p>
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
              <span>{pct}% used</span>
              <span>Resets in ~{fmtResetsIn(resetsAt)}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  pct >= 100
                    ? "bg-red-500"
                    : pct >= 80
                      ? "bg-amber-500"
                      : "bg-gradient-to-r from-violet-500 to-fuchsia-500",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plan cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {PLANS.map((plan) => {
          const isCurrent = activeTier === plan.tier;
          return (
            <Card
              key={plan.tier}
              className={cn(
                "relative overflow-hidden transition-shadow",
                isCurrent && "ring-2 ring-primary shadow-lg",
              )}
            >
              {isCurrent && (
                <div className="absolute right-4 top-4">
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                    <Check className="size-3" />
                    Current
                  </span>
                </div>
              )}
              <CardHeader className="pb-2">
                <div
                  className={cn(
                    "mb-2 inline-flex size-12 items-center justify-center rounded-xl bg-gradient-to-br text-white",
                    plan.accent,
                  )}
                >
                  {plan.icon}
                </div>
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {plan.description}
                </p>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground">/month</span>
                </div>

                <p className="mb-3 text-sm font-semibold">
                  {plan.limit.toLocaleString()} credits/day
                </p>

                <ul className="space-y-2">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6">
                  {isCurrent ? (
                    <Button variant="outline" className="w-full" disabled>
                      Current plan
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      onClick={() => switchTier(plan.tier)}
                      disabled={switching}
                    >
                      {switching ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : null}
                      {plan.tier === "pro" ? "Upgrade to Pro" : "Switch to Free"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Plans switch instantly. No payment required during beta — Pro is free
        while we build out the platform.
      </p>
    </div>
  );
}
