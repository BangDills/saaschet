"use client"; // Error boundaries must be Client Components

/**
 * Last-resort boundary for errors thrown by the ROOT layout itself, which
 * app/error.tsx cannot catch. Must render its own <html>/<body> because the
 * root layout is gone; styling is inline for the same reason — globals.css
 * may never have loaded.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="id">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
          color: "#0a0a0a",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          textAlign: "center",
          padding: "1rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>
            Terjadi kesalahan
          </h1>
          <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "#666" }}>
            Aplikasi gagal dimuat. Coba lagi atau muat ulang halaman.
          </p>
          {error.digest && (
            <p style={{ marginTop: "0.5rem", fontSize: "0.7rem", color: "#999", fontFamily: "monospace" }}>
              Kode: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              marginTop: "1.25rem",
              padding: "0.6rem 1.1rem",
              background: "#0a0a0a",
              color: "#ffffff",
              border: "none",
              borderRadius: "0.5rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Coba lagi
          </button>
        </div>
      </body>
    </html>
  );
}
