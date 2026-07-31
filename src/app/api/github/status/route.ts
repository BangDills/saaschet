import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/github/status
 *
 * Reports whether the current user has a GitHub App installation connected.
 * Never returns any token. Agent Mode write tools are available when
 * connected; otherwise repo access is read-only/public.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

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

  return NextResponse.json({
    connected: false,
    mode: "none",
    username: null,
    accessMode: "read_only",
  });
}
