import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/github/status
 *
 * Reports how the current user is connected to GitHub. Never returns any
 * token. The `mode` field drives the migration UI:
 *
 *   - "app"    → connected via the GitHub App (target state)
 *   - "legacy" → still on the old OAuth token; show the upgrade banner
 *   - "none"   → not connected; Agent Mode is read-only
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // New path: GitHub App installation(s). The user reads their own rows
  // under RLS, so the browser client is sufficient here.
  const { data: installations } = await supabase
    .from("github_installations")
    .select("account_login, account_type, repository_selection, permissions")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (installations && installations.length > 0) {
    return NextResponse.json({
      connected: true,
      mode: "app",
      accounts: installations.map((i) => ({
        login: i.account_login,
        type: i.account_type,
        repositorySelection: i.repository_selection,
        permissions: i.permissions,
      })),
      accessMode: "full",
    });
  }

  // Legacy path — remove in the Phase 3 cutover.
  const { data: profile } = await supabase
    .from("profiles")
    .select("github_token, github_username")
    .eq("id", user.id)
    .maybeSingle();

  const connected = !!profile?.github_token;

  return NextResponse.json({
    connected,
    mode: connected ? ("legacy" as const) : ("none" as const),
    username: profile?.github_username ?? null,
    accessMode: connected ? "full" : "read_only",
  });
}
