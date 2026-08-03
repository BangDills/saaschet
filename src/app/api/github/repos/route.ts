import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRepo } from "@/lib/github/client";
import {
  fetchInstallationRepos,
  sortReposByRecency,
  type InstallationRepo,
} from "@/lib/github/installation-repos";
import { readMirroredRepos } from "@/lib/github/installation-repos-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/github/repos
 *
 * Lists the repos the user's GitHub App installation(s) can see.
 *
 * One path for every installation: `GET /installation/repositories` with an
 * installation token returns exactly the accessible set whether the user chose
 * "all repositories" or picked a few. The old code branched on
 * `repository_selection` and served "selected" installs from a mirror table
 * that a 404'ing endpoint had never managed to fill — so choosing one repo at
 * install time looked identical to not being connected at all.
 *
 * The mirror is now a fallback for when GitHub itself fails, and a failure that
 * leaves us with nothing is reported as an error rather than as an empty list.
 *
 * Response:
 *  - 200 + { githubConnected: false } when no installation exists
 *  - 200 + { githubConnected: true, mode: "app", repos: [...] } on success
 *  - 200 + { …, repos: [...fallback], error } when GitHub failed but the
 *    mirror had rows
 *  - 502 when GitHub failed and there is nothing to fall back on
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

  const { data: installations } = await admin
    .from("github_installations")
    .select("id, installation_id, account_login")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (!installations || installations.length === 0) {
    return NextResponse.json({
      githubConnected: false,
      repos: [],
      message: "Connect the GitHub App to see your repositories here.",
    });
  }

  const all: InstallationRepo[] = [];
  const failures: string[] = [];

  for (const inst of installations) {
    try {
      all.push(...(await fetchInstallationRepos(inst.installation_id)));
    } catch (err) {
      console.error(
        `[github/repos] live list failed for installation ${inst.installation_id}:`,
        err instanceof Error ? err.message : String(err),
      );
      failures.push(inst.account_login);
      // Degraded, not empty: show what the last successful sync recorded.
      all.push(...(await readMirroredRepos(inst.id)));
    }
  }

  // De-dupe across installations (a repo can be visible via two orgs).
  const seen = new Set<number>();
  const unique = all.filter((r) =>
    seen.has(r.id) ? false : (seen.add(r.id), true),
  );

  const repos: UserRepo[] = sortReposByRecency(unique).map((r) => ({
    fullName: r.fullName,
    description: r.description,
    primaryLanguage: r.primaryLanguage,
    stars: r.stars,
    isPrivate: r.isPrivate,
    isFork: r.isFork,
    updatedAt: r.updatedAt,
  }));

  if (failures.length > 0 && repos.length === 0) {
    return NextResponse.json(
      {
        githubConnected: true,
        mode: "app",
        repos: [],
        error:
          "GitHub wouldn't return your repository list just now. " +
          "Try again in a moment, or check the app's access on GitHub.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    githubConnected: true,
    mode: "app",
    username: installations[0].account_login,
    repos,
    ...(failures.length > 0
      ? {
          error: `Showing a cached list for ${failures.join(", ")} — GitHub didn't answer just now.`,
        }
      : {}),
  });
}
