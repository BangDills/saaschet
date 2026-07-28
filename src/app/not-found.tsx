import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** 404 — previously fell through to Next's unstyled default page. */
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-md text-center">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          Halaman tidak ditemukan
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Halaman yang Anda cari tidak ada atau sudah dipindahkan.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4" />
          Kembali ke beranda
        </Link>
      </div>
    </main>
  );
}
