import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/github/status
 *
 * Returns whether the current user has connected GitHub for authenticated
 * Agent Mode write tools. Never returns the token itself.
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
    .select("github_token, github_username")
    .eq("id", user.id)
    .maybeSingle();

  const connected = !!profile?.github_token;

  return NextResponse.json({
    connected,
    username: profile?.github_username ?? null,
    accessMode: connected ? "full" : "read_only",
  });
}
