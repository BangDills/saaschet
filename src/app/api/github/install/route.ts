import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveOrigin } from "@/lib/url";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/github/install
 *
 * Sends the user to the GitHub App installation page. Unlike the old OAuth
 * authorize screen, this page lets the user pick WHICH repos we can see —
 * the core trust improvement of the App migration.
 *
 * GitHub redirects back to /api/github/callback?installation_id=…&state=…
 * after the user installs (and after repo-selection updates, since
 * "Redirect on update" is enabled in the App settings).
 */
export async function GET(request: NextRequest) {
  const origin = resolveOrigin(request);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const slug = process.env.GITHUB_APP_SLUG;
  if (!slug) {
    return NextResponse.json(
      { error: "GITHUB_APP_SLUG not configured" },
      { status: 500 },
    );
  }

  // Same state pattern as the legacy OAuth route: userId:random, verified
  // in the callback so one user's installation can't be claimed by another.
  const random = crypto.randomBytes(16).toString("hex");
  const state = Buffer.from(`${user.id}:${random}`).toString("base64url");

  return NextResponse.redirect(
    `https://github.com/apps/${slug}/installations/new?state=${state}`,
  );
}
