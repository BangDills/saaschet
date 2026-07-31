import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveOrigin } from "@/lib/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * OAuth + email-link callback handler.
 *
 * Supabase redirects users here after they click the email confirmation
 * link or finish an OAuth flow. We exchange the `code` query param for a
 * session cookie. For GitHub sign-ins we also copy the provider username +
 * avatar into `profiles` for display.
 *
 * Repo access is NOT handled here — that's the GitHub App's job
 * (/api/github/install). The provider_token issued at login stays inside
 * Supabase's session and is never persisted.
 */
export async function GET(request: NextRequest) {
  const origin = resolveOrigin(request);
  const searchParams = new URL(request.url).searchParams;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/ai-chat";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] exchangeCodeForSession error:", error.message);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  const user = data.user;

  // Check if user has a GitHub identity (login via GitHub OAuth provider).
  const githubIdentity = user?.identities?.find(
    (id) => id.provider === "github",
  );

  if (user && githubIdentity) {
    const meta = (githubIdentity.identity_data ?? {}) as {
      user_name?: string;
      avatar_url?: string;
    };

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        github_username: meta.user_name ?? null,
        avatar_url: meta.avatar_url ?? null,
      })
      .eq("id", user.id);

    if (updateError) {
      // Non-fatal: display metadata only. Log and continue to the app.
      console.error("[auth/callback] profile update error:", updateError.message);
    } else if (process.env.DEBUG_AUTH) {
      console.info("[auth/callback] github profile metadata updated");
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
