import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchUserRepos } from "@/lib/github/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/github/repos
 *
 * List the signed-in user's GitHub repositories. Requires the user to
 * have signed in with the GitHub OAuth provider so we have a stored
 * token in profiles.github_token.
 *
 * Response:
 *  - 200 + { githubConnected: false } when the user hasn't linked GitHub
 *  - 200 + { githubConnected: true, username, repos: [...] } on success
 *  - 502 + { githubConnected: true, error } when the upstream call fails
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("github_token, github_username")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.github_token) {
    return NextResponse.json({
      githubConnected: false,
      repos: [],
      message:
        "Sign in with GitHub from the login page to see your repositories here.",
    });
  }

  try {
    const repos = await fetchUserRepos(profile.github_token);
    return NextResponse.json({
      githubConnected: true,
      username: profile.github_username,
      repos,
    });
  } catch (err) {
    return NextResponse.json(
      {
        githubConnected: true,
        repos: [],
        error: err instanceof Error ? err.message : "Failed to fetch repos",
      },
      { status: 502 },
    );
  }
}
