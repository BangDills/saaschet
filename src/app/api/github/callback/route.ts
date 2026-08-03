import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveOrigin } from "@/lib/url";
import { createAppJwt } from "@/lib/github/app-auth";
import { syncInstallationRepos } from "@/lib/github/installation-repos-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/github/callback?installation_id=…&setup_action=install|update&state=…
 *
 * GitHub redirects here after the user installs the App — and again after
 * repo-selection updates (the App's "Redirect on update" setting points
 * back at this same URL). We record the installation metadata and sync the
 * visible repo list. Tokens are never stored; they're minted on demand by
 * app-auth.ts.
 */
export async function GET(request: NextRequest) {
  const origin = resolveOrigin(request);
  const searchParams = new URL(request.url).searchParams;
  const installationId = Number(searchParams.get("installation_id"));
  const state = searchParams.get("state");

  if (!installationId || !state) {
    return NextResponse.redirect(
      `${origin}/ai-chat?error=github_callback_missing_params`,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  // Same state verification as the legacy flow: the userId prefix must
  // match the signed-in user, so an install link can't be handed off.
  try {
    const decoded = Buffer.from(state, "base64url").toString();
    if (decoded.split(":")[0] !== user.id) {
      console.error("[github/callback] State mismatch for user", user.id);
      return NextResponse.redirect(
        `${origin}/ai-chat?error=github_state_mismatch`,
      );
    }
  } catch {
    return NextResponse.redirect(
      `${origin}/ai-chat?error=github_invalid_state`,
    );
  }

  // Fetch the installation as the App (JWT). This confirms it exists and
  // gives us the account, permissions, and repository_selection to record.
  const instRes = await fetch(
    `https://api.github.com/app/installations/${installationId}`,
    {
      headers: {
        Authorization: `Bearer ${createAppJwt()}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "celiuz-ai",
      },
      cache: "no-store",
    },
  );

  if (!instRes.ok) {
    console.error(
      "[github/callback] installation lookup failed:",
      instRes.status,
    );
    return NextResponse.redirect(
      `${origin}/ai-chat?error=github_installation_lookup_failed`,
    );
  }

  const inst = (await instRes.json()) as {
    account: { login: string; type: string };
    repository_selection: string;
    permissions: Record<string, string>;
  };

  const admin = createAdminClient();

  const { data: row, error } = await admin
    .from("github_installations")
    .upsert(
      {
        user_id: user.id,
        installation_id: installationId,
        account_login: inst.account.login,
        account_type:
          inst.account.type === "Organization" ? "Organization" : "User",
        repository_selection:
          inst.repository_selection === "selected" ? "selected" : "all",
        permissions: inst.permissions ?? {},
      },
      { onConflict: "user_id,installation_id" },
    )
    .select("id")
    .single();

  if (error || !row) {
    console.error("[github/callback] upsert failed:", error?.message);
    return NextResponse.redirect(
      `${origin}/ai-chat?error=github_install_save_failed`,
    );
  }

  // Mirror the visible repo list so a later GitHub hiccup degrades the picker
  // instead of blanking it. (This also runs on setup_action=update redirects.)
  // A failure here is NOT fatal: the picker asks GitHub live, so we log and
  // continue rather than telling the user the connection failed.
  try {
    await syncInstallationRepos(row.id, installationId);
  } catch (err) {
    console.error(
      "[github/callback] repo mirror sync failed:",
      err instanceof Error ? err.message : String(err),
    );
  }

  // Backfill github_username for display purposes.
  await admin
    .from("profiles")
    .update({ github_username: inst.account.login })
    .eq("id", user.id);

  if (process.env.DEBUG_AUTH) {
    console.info(
      `[github/callback] installation ${installationId} saved for ${inst.account.login}`,
    );
  }

  return NextResponse.redirect(`${origin}/ai-chat?github=connected`);
}
