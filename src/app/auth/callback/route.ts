import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
    console.error("[auth/callback] exchangeCodeForSession error:", error.message);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  const session = data.session;
  const user = data.user;

  // Try to get provider_token from multiple sources.
  let providerToken = session?.provider_token ?? null;

  // If exchangeCodeForSession didn't return it, try getSession().
  if (!providerToken) {
    const { data: sessionData } = await supabase.auth.getSession();
    providerToken = sessionData.session?.provider_token ?? null;
  }

  console.log("[auth/callback] user:", user?.id);
  console.log("[auth/callback] provider_token present:", !!providerToken);
  console.log(
    "[auth/callback] identities:",
    user?.identities?.map((i) => i.provider).join(", "),
  );

  // Check if user has a GitHub identity.
  const githubIdentity = user?.identities?.find(
    (id) => id.provider === "github",
  );

  // Extract GitHub metadata from the identity.
  const meta = (githubIdentity?.identity_data ?? user?.user_metadata ?? {}) as {
    user_name?: string;
    avatar_url?: string;
    full_name?: string;
    name?: string;
  };

  if (user && providerToken && githubIdentity) {
    // Save provider token directly to profiles.
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        github_token: providerToken,
        github_username: meta.user_name ?? null,
        avatar_url: meta.avatar_url ?? null,
      })
      .eq("id", user.id);

    if (updateError) {
      console.error("[auth/callback] profile update error:", updateError.message);
      // Try with admin client as fallback (bypasses RLS).
      try {
        const admin = createAdminClient();
        await admin
          .from("profiles")
          .update({
            github_token: providerToken,
            github_username: meta.user_name ?? null,
            avatar_url: meta.avatar_url ?? null,
          })
          .eq("id", user.id);
        console.log("[auth/callback] profile updated via admin client");
      } catch (adminErr) {
        console.error("[auth/callback] admin update also failed:", adminErr);
      }
    } else {
      console.log("[auth/callback] profile updated successfully");
    }
  } else if (user && githubIdentity && !providerToken) {
    // provider_token not available — this happens with some linkIdentity flows.
    // Save what we can (username) and log for debugging.
    console.warn(
      "[auth/callback] No provider_token available for GitHub identity. " +
        "The user may need to reconnect GitHub.",
    );
    await supabase
      .from("profiles")
      .update({
        github_username: meta.user_name ?? null,
        avatar_url: meta.avatar_url ?? null,
      })
      .eq("id", user.id);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
