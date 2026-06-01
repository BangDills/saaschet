"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for browser / Client Components.
 *
 * Reads the public env vars set in Vercel:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
