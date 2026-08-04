import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveOrigin } from "@/lib/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /auth/login/google
 *
 * Google OAuth entry-point, mirroring the GitHub flow. Two paths:
 *
 * 1. **User is not signed in** → `signInWithOAuth` starts a fresh Google
 *    sign-in (new or returning Supabase user).
 *
 * 2. **User is already signed in** (e.g. email/password account adding Google
 *    as a second way in) → `linkIdentity` attaches the Google identity to the
 *    existing profile, preserving the session.
 *
 * Requires the Google provider to be enabled in Supabase Auth with OAuth
 * credentials from Google Cloud Console, and "Manual Linking" enabled for
 * path 2 (Supabase → Authentication → Settings → "Allow manual linking").
 */
export async function GET(request: NextRequest) {
  const origin = resolveOrigin(request);
  const searchParams = new URL(request.url).searchParams;
  const next = searchParams.get("next") ?? "/ai-chat";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Path 2: already signed in — LINK Google to the existing account.
  if (user) {
    const { data, error } = await supabase.auth.linkIdentity({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (!error && data?.url) {
      return NextResponse.redirect(data.url);
    }

    const msg = error?.message ?? "google_link_failed";
    return NextResponse.redirect(
      `${origin}${next}?error=${encodeURIComponent(
        `Could not link Google: ${msg}. ` +
          `Make sure "Manual Linking" is enabled in Supabase Auth settings.`,
      )}`,
    );
  }

  // Path 1: not signed in — start a fresh Google OAuth sign-in.
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  if (error || !data.url) {
    const msg = error?.message ?? "google_oauth_init_failed";
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(msg)}`,
    );
  }

  return NextResponse.redirect(data.url);
}
