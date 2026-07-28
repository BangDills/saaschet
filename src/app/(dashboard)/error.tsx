"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * Dashboard-scope boundary: a crash in one page keeps the sidebar and
 * topbar alive, so the user can navigate away instead of losing the shell.
 */
export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard-error-boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="size-6" />
        </div>
        <h2 className="mt-4 text-lg font-bold tracking-tight">
          Halaman ini gagal dimuat
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Fitur lain tetap bisa dipakai lewat sidebar. Coba muat ulang bagian
          ini — kalau terus gagal, kabari kami.
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
    </div>
  );
}
