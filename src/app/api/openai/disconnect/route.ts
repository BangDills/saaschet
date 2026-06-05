import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/openai/disconnect
 *
 * Removes the user's stored OpenAI Codex OAuth tokens.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      openai_access_token: null,
      openai_refresh_token: null,
      openai_token_expires: null,
    })
    .eq("id", user.id);

  if (error) {
    console.error("[openai/disconnect] error:", error.message);
    return NextResponse.json(
      { error: "Failed to disconnect" },
      { status: 500 },
    );
  }

  return NextResponse.json({ status: "disconnected" });
}
