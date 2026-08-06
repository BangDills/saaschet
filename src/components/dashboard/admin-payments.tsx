"use client";

import * as React from "react";
import {
  BadgeCheck,
  CheckCircle2,
  ExternalLink,
  Loader2,
  XCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AdminPayment = {
  id: string;
  user_id: string;
  reference: string;
  amount_total: number;
  unique_code: number;
  status: string;
  proof_path: string | null;
  created_at: string;
  expires_at: string;
  paid_at: string | null;
  email: string | null;
  proofUrl: string | null;
};

function formatIdr(n: number): string {
  return "Rp" + n.toLocaleString("id-ID");
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  awaiting_confirmation: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  paid: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  expired: "bg-muted text-muted-foreground",
  rejected: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export function AdminPayments() {
  const [payments, setPayments] = React.useState<AdminPayment[] | null>(null);
  const [acting, setActing] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/payments");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Gagal memuat");
      setPayments(json.payments as AdminPayment[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat pembayaran");
      setPayments([]);
    }
  }, []);

  React.useEffect(() => {
    // Defer the first load out of the effect body so no setState runs
    // synchronously during render/commit (react-hooks/set-state-in-effect).
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(() => void load(), 10_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  async function act(paymentId: string, action: "approve" | "reject") {
    setActing(paymentId);
    setError(null);
    try {
      const res = await fetch("/api/admin/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Gagal");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Aksi gagal");
    } finally {
      setActing(null);
    }
  }

  const loading = payments === null;
  const list = payments ?? [];

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          Memuat pembayaran…
        </CardContent>
      </Card>
    );
  }

  const actionable = list.filter(
    (p) => p.status === "awaiting_confirmation" || p.status === "pending",
  );
  const rest = list.filter(
    (p) => p.status !== "awaiting_confirmation" && p.status !== "pending",
  );

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {actionable.length === 0 && rest.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Belum ada pembayaran.
          </CardContent>
        </Card>
      ) : null}

      {[...actionable, ...rest].map((p) => {
        const needsAction = p.status === "awaiting_confirmation";
        return (
          <Card key={p.id} className={cn(needsAction && "ring-1 ring-blue-500/40")}>
            <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold">{p.reference}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-medium",
                      STATUS_STYLE[p.status] ?? "bg-muted text-muted-foreground",
                    )}
                  >
                    {p.status}
                  </span>
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {p.email ?? p.user_id}
                </p>
                <p className="text-sm">
                  <span className="font-semibold tabular-nums">
                    {formatIdr(p.amount_total)}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    kode +{p.unique_code} · {fmtTime(p.created_at)}
                  </span>
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {p.proofUrl ? (
                  <a href={p.proofUrl} target="_blank" rel="noreferrer">
                    <Button variant="outline" size="sm">
                      <ExternalLink className="mr-1.5 size-3.5" />
                      Bukti
                    </Button>
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">tanpa bukti</span>
                )}

                {needsAction || p.status === "pending" ? (
                  <>
                    <Button
                      size="sm"
                      onClick={() => act(p.id, "approve")}
                      disabled={acting === p.id}
                    >
                      {acting === p.id ? (
                        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-1.5 size-3.5" />
                      )}
                      Setujui
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => act(p.id, "reject")}
                      disabled={acting === p.id}
                    >
                      <XCircle className="mr-1.5 size-3.5" />
                      Tolak
                    </Button>
                  </>
                ) : p.status === "paid" ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                    <BadgeCheck className="size-3.5" />
                    lunas {p.paid_at ? fmtTime(p.paid_at) : ""}
                  </span>
                ) : null}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
