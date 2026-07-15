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
    price: "Rp 0 / hari",
    icon: Sparkles,
    perks: [
      "50 kredit per hari",
      "Semua model chat",
      "Agent Mode (baca + tulis GitHub)",
      "Web search & repo connect",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    limit: 3000,
    price: "Rp 10.000 / 24 jam",
    icon: Crown,
    perks: [
      "3.000 kredit per 24 jam",
      "Semua di Free",
      "Prioritas untuk agent run panjang",
      "Respons konteks lebih besar",
    ],
  },
];

const WHATSAPP_PROMO_URL =
  "https://wa.me/6281414185065?text=" +
  encodeURIComponent(
    "Halo admin Celiuz AI, saya mau aktifkan Pro harian (Rp10.000). Email akun saya: ",
  );

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
          Terpakai <span className="font-medium text-foreground">{usedToday}</span>{" "}
          kredit hari ini.
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

                {isCurrent ? (
                  <div className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-muted text-sm font-semibold text-muted-foreground">
                    {plan.id === "pro" ? "Pro aktif 24 jam" : "Paket saat ini"}
                  </div>
                ) : plan.id === "pro" ? (
                  <a href={WHATSAPP_PROMO_URL} target="_blank" rel="noreferrer">
                    <button
                      type="button"
                      className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                    >
                      <Crown className="size-4" />
                      Aktifkan Pro · Rp10.000
                    </button>
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => switchTo(plan.id)}
                    disabled={!!pending}
                    className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card text-sm font-semibold transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isPending && <Loader2 className="size-4 animate-spin" />}
                    Ganti ke Free
                  </button>
                )}
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
