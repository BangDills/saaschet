import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/github/oauth
 *
 * Starts a standalone GitHub OAuth flow to get a personal access token
 * for repo access. This is SEPARATE from Supabase auth — it only gets
 * a GitHub token and stores it in profiles.github_token.
 *
 * This allows multiple Celiuz AI users to connect the same GitHub account.
 */
export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "GITHUB_APP_CLIENT_ID not configured" },
      { status: 500 },
    );
  }

  // Create a state parameter for CSRF protection.
  // Format: userId:randomBytes (we verify userId on callback).
  const random = crypto.randomBytes(16).toString("hex");
  const state = Buffer.from(`${user.id}:${random}`).toString("base64url");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/api/github/callback`,
    scope: "read:user user:email repo",
    state,
  });

  return NextResponse.redirect(
    `https://github.com/login/oauth/authorize?${params.toString()}`,
  );
}
