import type { NextConfig } from "next";

const contentSecurityPolicy = [
  "default-src 'self'",
  // Avatars + lobehub icons + GitHub + Supabase storage + user uploads.
  "img-src 'self' data: blob: https:",
  // Tailwind injects styles at runtime; Next also uses inline styles.
  "style-src 'self' 'unsafe-inline'",
  // Next hydration needs inline scripts in production.
  "script-src 'self' 'unsafe-inline'",
  // API + Supabase realtime + GitHub.
  "connect-src 'self' https://api.fireworks.ai https://*.supabase.co wss://*.supabase.co https://api.github.com",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders: { key: string; value: string }[] = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
