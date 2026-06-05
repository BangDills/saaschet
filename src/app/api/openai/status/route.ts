import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/openai/status
 *
 * Returns whether the current user has a connected OpenAI account.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("openai_access_token")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json({
    connected: !!profile?.openai_access_token,
  });
}
