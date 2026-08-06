"use client";

import * as React from "react";
import Link from "next/link";
import {
  Check,
  Crown,
  Loader2,
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
}[] = [
  {
    tier: "free",
    name: "Free",
    price: "Rp0",
    description: "Pas untuk mencoba Celiuz AI",
    limit: 50,
    features: [
      "50 kredit per hari",
      "AI Chat dengan semua model",
      "Integrasi web search",
      "Konteks repo GitHub",
      "Agent mode dasar",
      "Riwayat chat",
    ],
  },
  {
    tier: "pro",
    name: "Pro",
    price: "Rp10.000",
    description: "24-hour trial — promo pembukaan minggu ini",
    limit: 3000,
    features: [
      "3.000 kredit per 24 jam",
      "AI Chat dengan semua model",
      "Integrasi web search",
      "Konteks repo GitHub",
      "Agent mode penuh (baca + tulis + PR)",
      "Dukungan prioritas",
      "Riwayat chat",
      "Analitik pemakaian",
    ],
  },
];

const WHATSAPP_PROMO_URL =
  "https://wa.me/6281414185065?text=" +
  encodeURIComponent(
    "Halo admin Celiuz AI, saya mau aktifkan Pro harian (Rp10.000). Email akun saya: ",
  );

// Fallback dukungan manual — masih dipakai di bawah.

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
    // Downgrading from Pro forfeits the rest of a PAID 24-hour window —
    // never let one stray tap do that silently.
    if (activeTier === "pro" && newTier === "free") {
      const ok = window.confirm(
        "Turun ke Free sekarang? Sisa waktu Pro Anda (yang sudah dibayar) akan hangus dan limit kembali ke 50 kredit/hari.",
      );
      if (!ok) return;
    }
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
            <Zap className="size-5 text-muted-foreground" />
            Pemakaian Hari Ini
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Terpakai hari ini</p>
              <p className="text-2xl font-bold tabular-nums">{usedToday}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Sisa</p>
              <p className="text-2xl font-bold tabular-nums">{remaining}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total sepanjang waktu</p>
              <p className="text-2xl font-bold tabular-nums">
                {totalUsed.toLocaleString()}
              </p>
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
              <span>{pct}% terpakai</span>
              <span>Reset dalam ~{fmtResetsIn(resetsAt)}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  pct >= 100
                    ? "bg-red-500"
                    : pct >= 80
                      ? "bg-amber-500"
                      : "bg-foreground",
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
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {plan.description}
                </p>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground">
                    {plan.tier === "pro" ? "/24 jam" : "/hari"}
                  </span>
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
                      <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6">
                  {isCurrent ? (
                    <Button variant="outline" className="w-full" disabled>
                      {plan.tier === "pro" ? "Pro aktif 24 jam" : "Current plan"}
                    </Button>
                  ) : plan.tier === "pro" ? (
                    <>
                      <Link href="/pro/checkout">
                        <Button className="w-full">
                          <Crown className="mr-2 size-4" />
                          Aktifkan Pro · Rp10.000
                        </Button>
                      </Link>
                      <a
                        href={WHATSAPP_PROMO_URL}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 block text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
                      >
                        Butuh bantuan? Hubungi admin
                      </a>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => switchTier(plan.tier)}
                      disabled={switching}
                    >
                      {switching ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : null}
                      Ganti ke Free
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Pro adalah trial 24 jam. Klik &quot;Aktifkan Pro&quot; untuk lanjut ke
        WhatsApp admin, bayar Rp10.000, lalu admin aktifkan Pro Anda selama 24 jam.
      </p>
    </div>
  );
}
