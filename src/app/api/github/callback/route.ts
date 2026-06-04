import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/github/callback
 *
 * Handles the callback from GitHub OAuth. Exchanges the code for an
 * access token and stores it in profiles.github_token.
 *
 * This is the standalone OAuth flow (NOT Supabase identity linking).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const ghError = searchParams.get("error");

  if (ghError) {
    console.error("[github/callback] GitHub OAuth error:", ghError);
    return NextResponse.redirect(
      `${origin}/ai-chat?error=${encodeURIComponent(`GitHub: ${ghError}`)}`,
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${origin}/ai-chat?error=github_callback_missing_params`,
    );
  }

  // Verify the logged-in user matches the state parameter.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  // Decode state and verify userId.
  try {
    const decoded = Buffer.from(state, "base64url").toString();
    const userId = decoded.split(":")[0];
    if (userId !== user.id) {
      console.error("[github/callback] State mismatch:", userId, "vs", user.id);
      return NextResponse.redirect(
        `${origin}/ai-chat?error=github_state_mismatch`,
      );
    }
  } catch {
    return NextResponse.redirect(
      `${origin}/ai-chat?error=github_invalid_state`,
    );
  }

  // Exchange the code for an access token.
  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      `${origin}/ai-chat?error=github_app_not_configured`,
    );
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    token_type?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (tokenData.error || !tokenData.access_token) {
    console.error("[github/callback] Token exchange error:", tokenData.error);
    return NextResponse.redirect(
      `${origin}/ai-chat?error=${encodeURIComponent(
        tokenData.error_description ?? tokenData.error ?? "token_exchange_failed",
      )}`,
    );
  }

  const accessToken = tokenData.access_token;

  // Fetch the GitHub user's profile to get username.
  let githubUsername: string | null = null;
  let avatarUrl: string | null = null;
  try {
    const ghUser = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (ghUser.ok) {
      const userData = (await ghUser.json()) as {
        login?: string;
        avatar_url?: string;
      };
      githubUsername = userData.login ?? null;
      avatarUrl = userData.avatar_url ?? null;
    }
  } catch {
    // Non-fatal — we can still save the token.
  }

  // Save the token to profiles (use admin client to bypass RLS).
  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("profiles")
    .update({
      github_token: accessToken,
      github_username: githubUsername,
      ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
    })
    .eq("id", user.id);

  if (updateError) {
    console.error("[github/callback] Profile update error:", updateError.message);
    return NextResponse.redirect(
      `${origin}/ai-chat?error=profile_update_failed`,
    );
  }

  if (process.env.DEBUG_AUTH) {
    console.info(`[github/callback] token saved for ${githubUsername}`);
  }

  return NextResponse.redirect(`${origin}/ai-chat`);
}
