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
 * IMPORTANT: For path 2 to work, **"Manual Linking" must be enabled** in
 * Supabase: Dashboard → Authentication → Settings → toggle
 * "Allow manual linking".
 */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  const next = searchParams.get("next") ?? "/ai-chat";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Path 2: User is already signed in — LINK GitHub to their existing account.
  // This does NOT create a new account; it adds GitHub as a second identity.
  if (user) {
    const { data, error } = await supabase.auth.linkIdentity({
      provider: "github",
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
        scopes: "read:user user:email repo",
        queryParams: {
          prompt: "consent",
        },
      },
    });

    if (!error && data?.url) {
      return NextResponse.redirect(data.url);
    }

    // linkIdentity failed — DO NOT fall through to signInWithOAuth,
    // because that would create a new account and log out the current user.
    // Instead, redirect back with an error message.
    const msg = error?.message ?? "github_link_failed";
    return NextResponse.redirect(
      `${origin}${next}?error=${encodeURIComponent(
        `Could not link GitHub: ${msg}. ` +
          `Make sure "Manual Linking" is enabled in Supabase Auth settings.`,
      )}`,
    );
  }

  // Path 1: User is NOT signed in — start a fresh GitHub OAuth sign-in.
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      scopes: "read:user user:email repo",
      queryParams: {
        prompt: "consent",
      },
    },
  });

  if (error || !data.url) {
    const msg = error?.message ?? "github_oauth_init_failed";
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(msg)}`,
    );
  }

  return NextResponse.redirect(data.url);
}
