"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import {
  CheckCircle2,
  Copy,
  Loader2,
  QrCode,
  Upload,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fireCreditsRefresh } from "./credits-meter";

type Payment = {
  id: string;
  reference: string;
  amount_total: number;
  status: "pending" | "awaiting_confirmation" | "paid" | "expired" | "rejected";
  expires_at: string;
  qris_payload?: string;
  proof_path?: string | null;
};

function formatIdr(n: number): string {
  return "Rp" + n.toLocaleString("id-ID");
}

function useCountdown(expiresAt: string | null) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  if (!expiresAt) return null;
  const ms = Math.max(0, new Date(expiresAt).getTime() - now);
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return { ms, label: `${m}:${String(s).padStart(2, "0")}` };
}

export function ProCheckout() {
  const router = useRouter();
  const [payment, setPayment] = React.useState<Payment | null>(null);
  const [qrDataUrl, setQrDataUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [uploaded, setUploaded] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const countdown = useCountdown(payment?.expires_at ?? null);

  // Open (or resume) a checkout on mount.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/payments/create", { method: "POST" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Gagal membuka pembayaran");
        if (cancelled) return;
        setPayment(json.payment as Payment);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Gagal membuka pembayaran");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Render the QR once we have a payload.
  React.useEffect(() => {
    if (!payment?.qris_payload) return;
    QRCode.toDataURL(payment.qris_payload, { width: 320, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [payment?.qris_payload]);

  // Poll for status (admin approval flips it to paid).
  React.useEffect(() => {
    if (!payment || payment.status === "paid" || payment.status === "expired")
      return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/payments/status?id=${payment.id}`);
      if (!res.ok) return;
      const json = await res.json();
      const next = json.payment as Payment;
      setPayment((p) => (p ? { ...p, status: next.status } : p));
      if (next.status === "paid") {
        fireCreditsRefresh();
        setTimeout(() => router.refresh(), 800);
      }
    }, 5000);
    return () => clearInterval(t);
  }, [payment, router]);

  async function copyReference() {
    if (!payment) return;
    try {
      await navigator.clipboard.writeText(payment.reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  async function onProofChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !payment) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("paymentId", payment.id);
      const up = await fetch("/api/payments/proof", { method: "POST", body: form });
      const upJson = await up.json();
      if (!up.ok) throw new Error(upJson.error ?? "Gagal mengunggah bukti");

      const mark = await fetch("/api/payments/mark-received", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: payment.id, proofPath: upJson.path }),
      });
      const markJson = await mark.json();
      if (!mark.ok) throw new Error(markJson.error ?? "Gagal menandai pembayaran");

      setPayment((p) => (p ? { ...p, status: markJson.status } : p));
      setUploaded(true);
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Gagal mengirim bukti");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          Menyiapkan pembayaran…
        </CardContent>
      </Card>
    );
  }

  if (error && !payment) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <XCircle className="size-8 text-destructive" />
          <p className="text-sm text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!payment) return null;

  const isPaid = payment.status === "paid";
  const isExpired = payment.status === "expired" || countdown?.ms === 0;
  const isAwaiting = payment.status === "awaiting_confirmation";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <QrCode className="size-5 text-muted-foreground" />
          Pembayaran Pro
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {isPaid ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 className="size-12 text-emerald-500" />
            <p className="text-lg font-semibold">Pembayaran dikonfirmasi</p>
            <p className="text-sm text-muted-foreground">
              Pro aktif selama 24 jam. Selamat menikmati limit 3.000 kredit.
            </p>
          </div>
        ) : isExpired ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <XCircle className="size-12 text-muted-foreground" />
            <p className="text-lg font-semibold">Pembayaran kedaluwarsa</p>
            <p className="text-sm text-muted-foreground">
              Kode unik sudah tidak berlaku. Buat pembayaran baru.
            </p>
            <Button onClick={() => window.location.reload()}>Buat pembayaran baru</Button>
          </div>
        ) : (
          <>
            {/* Unique amount — the single most important thing to copy exactly */}
            <div className="rounded-lg border bg-muted/40 p-4 text-center">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Transfer tepat sejumlah
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">
                {formatIdr(payment.amount_total)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                3 digit terakhir adalah kode unik pembayaranmu — jangan dibulatkan.
              </p>
            </div>

            {/* QR */}
            <div className="flex flex-col items-center gap-2">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrDataUrl}
                  alt={`QRIS ${payment.reference}`}
                  className="w-64 max-w-full rounded-md border bg-white p-2"
                />
              ) : (
                <div className="flex h-64 w-64 items-center justify-center rounded-md border">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Scan dengan aplikasi bank / e-wallet apa pun (QRIS).
              </p>
            </div>

            {/* Reference + countdown */}
            <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Kode referensi
                </p>
                <p className="font-mono text-sm font-semibold">{payment.reference}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={copyReference}>
                {copied ? (
                  <CheckCircle2 className="size-4 text-emerald-500" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Sisa waktu
                </p>
                <p
                  className={cn(
                    "font-mono text-sm font-semibold tabular-nums",
                    countdown && countdown.ms < 60_000 && "text-destructive",
                  )}
                >
                  {countdown?.label ?? "—"}
                </p>
              </div>
            </div>

            {/* Upload proof */}
            <div className="space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={onProofChosen}
              />
              {isAwaiting || uploaded ? (
                <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-4" />
                  Bukti diterima. Menunggu konfirmasi admin — halaman ini akan
                  diperbarui otomatis.
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 size-4" />
                  )}
                  {uploading ? "Mengunggah…" : "Saya sudah bayar — unggah bukti"}
                </Button>
              )}
              {error ? (
                <p className="text-center text-xs text-destructive">{error}</p>
              ) : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
