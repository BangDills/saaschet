import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /auth/login/github
 *
 * Initiates the GitHub OAuth flow via Supabase. Supabase redirects the
 * user to GitHub, GitHub bounces them back to our /auth/callback handler
 * with a code, and we exchange that code for a session there.
 *
 * Scopes requested:
 * - `read:user`     — basic profile
 * - `user:email`    — primary email
 * - `public_repo`   — read access to user's public repos (also gives the
 *                     5000 req/hour rate limit for content fetching)
 */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  const next = searchParams.get("next") ?? "/ai-chat";

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      scopes: "read:user user:email public_repo",
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
