import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  pollDeviceAuth,
  exchangeCodeForTokens,
  expiresAt,
} from "@/lib/openai/codex-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/openai/poll
 *
 * Polls the OpenAI device auth endpoint to check if the user has completed
 * the login flow. When completed, exchanges the code for tokens and stores
 * them in the user's profile.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await request.json()) as {
    device_auth_id?: string;
    user_code?: string;
  };

  if (!body.device_auth_id || !body.user_code) {
    return NextResponse.json(
      { error: "Missing device_auth_id or user_code" },
      { status: 400 },
    );
  }

  try {
    const result = await pollDeviceAuth(body.device_auth_id, body.user_code);

    if (result.status === "pending") {
      return NextResponse.json({ status: "pending" });
    }

    if (result.status === "error") {
      return NextResponse.json(
        { status: "error", error: result.message },
        { status: 502 },
      );
    }

    // Exchange the authorization code for tokens
    const tokens = await exchangeCodeForTokens(
      result.authorization_code,
      result.code_verifier,
    );

    // Store tokens in profiles using admin client (bypasses RLS)
    const admin = createAdminClient();
    const { error: updateError } = await admin
      .from("profiles")
      .update({
        openai_access_token: tokens.access_token,
        openai_refresh_token: tokens.refresh_token,
        openai_token_expires: expiresAt(tokens.expires_in),
      })
      .eq("id", user.id);

    if (updateError) {
      console.error("[openai/poll] profile update error:", updateError.message);
      return NextResponse.json(
        { status: "error", error: "Failed to save tokens" },
        { status: 500 },
      );
    }

    return NextResponse.json({ status: "connected" });
  } catch (err) {
    console.error("[openai/poll] error:", err);
    return NextResponse.json(
      { status: "error", error: "Poll failed" },
      { status: 502 },
    );
  }
}
