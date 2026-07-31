import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchUserRepos, type UserRepo } from "@/lib/github/client";
import { getInstallationToken } from "@/lib/github/app-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/github/repos
 *
 * Lists the repos the user can point the agent at.
 *
 *   - GitHub App users: repos visible to their installation(s). When the
 *     installation covers "all" repos of an account we ask GitHub for the
 *     installation's list; for "selected" installations we answer straight
 *     from github_installation_repos (synced by callback + webhook).
 *   - Legacy OAuth users: their /user/repos list (unchanged behavior).
 *
 * Response:
 *  - 200 + { githubConnected: false } when nothing is linked
 *  - 200 + { githubConnected: true, mode, repos: [...] } on success
 *  - 502 when an upstream GitHub call fails
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // ── GitHub App path ────────────────────────────────────────────────
  const { data: installations } = await admin
    .from("github_installations")
    .select("id, installation_id, account_login, repository_selection")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (installations && installations.length > 0) {
    try {
      const all: UserRepo[] = [];

      for (const inst of installations) {
        if (inst.repository_selection === "selected") {
          // Answer from our synced table — no API call, always fresh.
          const { data: rows } = await admin
            .from("github_installation_repos")
            .select("full_name, is_private")
            .eq("installation_id", inst.id);

          for (const r of rows ?? []) {
            all.push({
              fullName: r.full_name,
              description: null,
              primaryLanguage: null,
              stars: 0,
              isPrivate: r.is_private,
              isFork: false,
              updatedAt: 0,
            });
          }
        } else {
          // "all" — ask GitHub for the installation's accessible repos.
          const token = await getInstallationToken(inst.installation_id);
          const res = await fetch(
            `https://api.github.com/installation/repositories?per_page=100`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "celiuz-ai",
              },
              cache: "no-store",
            },
          );
          if (!res.ok) continue;

          const json = (await res.json()) as {
            repositories: Array<{
              full_name: string;
              description: string | null;
              language: string | null;
              stargazers_count: number;
              private: boolean;
              fork: boolean;
              updated_at: string;
            }>;
          };
          for (const r of json.repositories) {
            all.push({
              fullName: r.full_name,
              description: r.description,
              primaryLanguage: r.language,
              stars: r.stargazers_count,
              isPrivate: r.private,
              isFork: r.fork,
              updatedAt: new Date(r.updated_at).getTime(),
            });
          }
        }
      }

      // De-dupe across installations (a repo can be visible via two orgs).
      const seen = new Set<string>();
      const repos = all.filter((r) =>
        seen.has(r.fullName) ? false : (seen.add(r.fullName), true),
      );
      repos.sort((a, b) => b.updatedAt - a.updatedAt);

      return NextResponse.json({
        githubConnected: true,
        mode: "app",
        username: installations[0].account_login,
        repos,
      });
    } catch (err) {
      console.error(
        "[github/repos] installation fetch failed:",
        err instanceof Error ? err.message : String(err),
      );
      return NextResponse.json(
        {
          githubConnected: true,
          mode: "app",
          repos: [],
          error: "Failed to fetch repos from GitHub.",
        },
        { status: 502 },
      );
    }
  }

  // ── Legacy OAuth path — remove in the Phase 3 cutover ──────────────
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
        "Connect the GitHub App to see your repositories here.",
    });
  }

  try {
    const repos = await fetchUserRepos(profile.github_token);
    return NextResponse.json({
      githubConnected: true,
      mode: "legacy",
      username: profile.github_username,
      repos,
    });
  } catch (err) {
    console.error(
      "[github/repos] fetch failed:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      {
        githubConnected: true,
        repos: [],
        error: "Failed to fetch repos from GitHub.",
      },
      { status: 502 },
    );
  }
}
