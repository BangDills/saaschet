import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client that uses the **service role** key.
 *
 * Bypasses Row Level Security. Use ONLY in trusted server code (API
 * routes / server actions) for privileged writes — e.g. updating a
 * user's credit balance, where we don't want to grant the user
 * UPDATE permission on the table.
 *
 * Never import this from a Client Component.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY (and NEXT_PUBLIC_SUPABASE_URL) must be set",
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
