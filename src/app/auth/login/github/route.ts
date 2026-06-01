import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /auth/login/github
 *
 * Smart entry-point for the GitHub OAuth flow. Two paths:
 *
 * 1. **User is not signed in** → calls `signInWithOAuth`. After GitHub
 *    approval the user is signed in to Supabase as a new (or returning)
 *    user.
 *
 * 2. **User is already signed in** (e.g. signed up via email/password,
 *    now wants to connect their GitHub account from inside the app) →
 *    calls `linkIdentity`. After GitHub approval the GitHub identity
 *    becomes a second identity on the existing user's profile, the
 *    session is preserved, and `profiles.github_token` gets populated
 *    in the callback handler.
 *
 * Scopes requested:
 * - `read:user`     — basic profile
 * - `user:email`    — primary email
 * - `public_repo`   — read access to the user's public repos (also gives
 *                     the 5000 req/hour rate limit for content fetching)
 *
 * NOTE: For path 2 to work, **"Manual Linking" must be enabled** in
 * Supabase: Dashboard → Authentication → Settings → toggle
 * "Allow manual linking". Without it, linkIdentity returns an error and
 * we fall back to `signInWithOAuth`, which on most setups will still
 * link by email if "Email confirmations" are on.
 */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  const next = searchParams.get("next") ?? "/ai-chat";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Path 2: already signed in — try to link the GitHub identity.
  if (user) {
    const { data, error } = await supabase.auth.linkIdentity({
      provider: "github",
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
        scopes: "read:user user:email public_repo",
      },
    });
    if (!error && data?.url) {
      return NextResponse.redirect(data.url);
    }
    // Fall through to signInWithOAuth as a fallback if linkIdentity isn't
    // available on this Supabase project (the "Manual Linking" feature
    // toggle is off, or older client). Supabase will usually still merge
    // by email if Email confirmations are required.
  }

  // Path 1: not signed in (or fallback) — start a fresh OAuth flow.
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      scopes: "read:user user:email public_repo",
    },
  });

  if (error || !data.url) {
    const msg = error?.message ?? "github_oauth_init_failed";
    const target = user ? "/ai-chat" : "/login";
    return NextResponse.redirect(
      `${origin}${target}?error=${encodeURIComponent(msg)}`,
    );
  }

  return NextResponse.redirect(data.url);
}
