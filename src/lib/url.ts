import type { NextRequest } from "next/server";

/**
 * Resolve the public origin (scheme + host) of an incoming request.
 *
 * Behind a reverse proxy (Coolify/Traefik, Vercel, nginx), `new URL(request.url)`
 * can resolve to the container's internal address (e.g. http://0.0.0.0:3000)
 * instead of the public domain. That breaks OAuth redirects — Supabase/GitHub
 * would be told to redirect back to 0.0.0.0:3000, which the user's browser
 * can't reach.
 *
 * Prefer the proxy-forwarded headers (x-forwarded-proto / x-forwarded-host,
 * or the forwarded RFC header), then fall back to request.url.
 */
export function resolveOrigin(request: NextRequest): string {
  const forwardedHost =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host");
  const forwardedProto =
    request.headers.get("x-forwarded-proto") ||
    (request.headers.get("forwarded")?.match(/proto=([^;,]+)/i)?.[1] ??
      null);

  if (forwardedHost) {
    const proto = forwardedProto ?? "https";
    return `${proto}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}

/**
 * Cosmetically redact the Daytona vendor path from a string that will be
 * shown to the user (chat UI, tool-call display). The sandbox container's
 * real home is /home/daytona/... — that path must stay literal in commands
 * we actually execute, but it shouldn't leak the vendor name in what we
 * render. This only rewrites the display string; never apply it to a command
 * before execution.
 */
export function redactVendorPath(str: string): string {
  return str.replace(/\/home\/daytona(\/|$)/g, "/home/sandbox$1");
}
