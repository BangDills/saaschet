import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/github/disconnect
 *
 * Disconnects GitHub for the current user, whichever mechanism they're on:
 * deletes GitHub App installation rows (metadata only — installation tokens
 * expire on their own within the hour) and clears the cached username.
 *
 * Note: this does NOT uninstall the App on GitHub's side. Users can do that
 * themselves at https://github.com/settings/installations — and our webhook
 * will clean up the row when they do.
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

  // App path: drop installation rows (repos cascade).
  const { error: instError } = await admin
    .from("github_installations")
    .delete()
    .eq("user_id", user.id);

  if (instError) {
    console.error("[github/disconnect] installations:", instError.message);
    return NextResponse.json(
      { error: "Failed to disconnect GitHub account" },
      { status: 500 },
    );
  }

  // Clear the cached display name. `github_token` used to be cleared here too;
  // 0029 dropped that column, and writing to a column that no longer exists
  // makes PostgREST reject the whole update — which turned this endpoint into a
  // 500 and left the Disconnect button unable to disconnect anything.
  const { error } = await admin
    .from("profiles")
    .update({
      github_username: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    console.error("[github/disconnect] profiles:", error.message);
    return NextResponse.json(
      { error: "Failed to disconnect GitHub account" },
      { status: 500 },
    );
  }

  return NextResponse.json({ status: "disconnected" });
}
