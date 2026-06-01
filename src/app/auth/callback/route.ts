import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * OAuth + email-link callback handler.
 *
 * Supabase redirects users here after they click the email confirmation
 * link or finish an OAuth flow. We exchange the `code` query param for a
 * session cookie. For OAuth flows that return a `provider_token` (e.g.
 * GitHub), we copy the token + provider username into `profiles` so the
 * rest of the app can call the provider's API on behalf of the user.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/ai-chat";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  // For OAuth providers, persist the provider access token so we can call
  // their API later. Currently only GitHub is supported.
  const session = data.session;
  const user = data.user;
  const providerToken = session?.provider_token;
  const meta = (user?.user_metadata ?? {}) as {
    user_name?: string;
    avatar_url?: string;
    full_name?: string;
    name?: string;
  };

  if (user && providerToken) {
    const provider = user.app_metadata?.provider;
    if (provider === "github") {
      await supabase
        .from("profiles")
        .update({
          github_token: providerToken,
          github_username: meta.user_name ?? null,
          avatar_url: meta.avatar_url ?? null,
          full_name: meta.full_name ?? meta.name ?? null,
        })
        .eq("id", user.id);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
