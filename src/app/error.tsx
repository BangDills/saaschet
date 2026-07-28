"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * Root error boundary. Before this existed, one uncaught error in a server
 * component meant a blank white screen with no way back.
 *
 * Note: Next 16 passes `unstable_retry` (the old `reset` prop is gone) —
 * it re-fetches and re-renders the failed segment, server components
 * included.
 */
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[error-boundary]", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="size-6" />
        </div>
        <h1 className="mt-4 text-xl font-bold tracking-tight">
          Terjadi kesalahan
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Ada yang tidak beres saat memuat halaman ini. Coba lagi — kalau
          masih gagal, muat ulang halaman atau kembali beberapa saat lagi.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-[11px] text-muted-foreground">
            Kode: {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="mt-6 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RotateCcw className="size-4" />
          Coba lagi
        </button>
      </div>
    </main>
  );
}
