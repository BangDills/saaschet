import { readFileSync } from "node:fs";
import path from "node:path";
import {
  fetchInstallationRepos,
  installationReposUrl,
  mapInstallationRepo,
  sortReposByRecency,
} from "./installation-repos";
import { runSelfcheck } from "../selfcheck/watchdog";

/**
 * Guard for the bug where installing the App on ONE repository looked exactly
 * like not connecting GitHub at all.
 *
 * Two things had to line up to produce that. First, the sync called
 * `/app/installations/{id}/repositories`, which does not exist — GitHub answers
 * 404 — and the code did `if (!res.ok) return;`, so the mirror table stayed
 * empty and nothing was logged. Second, `/api/github/repos` only consulted that
 * table when `repository_selection === "selected"`; "all repositories" installs
 * took a live-API path and worked, which is why the failure looked like a
 * setting rather than a bug.
 *
 * So this pins the three properties that made it possible: the right endpoint,
 * a loud failure, and no branch on repository_selection that can rot in the
 * dark. The fetch is exercised against an injected fetch — no network, and the
 * assertion is on the URL and Authorization header actually sent.
 */

let checks = 0;
function check(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  checks++;
}

function repo(id: number, updatedAt?: string) {
  return {
    id,
    full_name: `acme/repo-${id}`,
    description: null,
    language: "TypeScript",
    stargazers_count: 3,
    private: true,
    fork: false,
    updated_at: updatedAt,
  };
}

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

async function main(): Promise<void> {
  /* ── The endpoint, and the credential that authenticates it ─────────────── */

  const url = installationReposUrl(1);
  check(
    url.startsWith("https://api.github.com/installation/repositories?"),
    `the repo list must come from /installation/repositories (got ${url})`,
  );
  check(
    !/\/app\/installations\/[^/]+\/repositories/.test(url),
    "/app/installations/{id}/repositories is a 404 — it must never be used again",
  );

  {
    const seen: Array<{ url: string; auth: string | null }> = [];
    const repos = await fetchInstallationRepos(42, {
      tokenFor: async (id) => `ghs_installation_${id}`,
      fetchImpl: async (u, init) => {
        seen.push({
          url: u,
          auth: new Headers(init?.headers).get("authorization"),
        });
        return ok({ repositories: [repo(1, "2026-07-01T00:00:00Z")] });
      },
    });

    check(seen.length === 1, "a single short page means a single request");
    check(
      seen[0].url === installationReposUrl(1),
      "the first request must be page 1 of /installation/repositories",
    );
    check(
      seen[0].auth === "Bearer ghs_installation_42",
      // An App JWT is rejected by this endpoint; only the installation token works.
      `must authenticate with the installation token, not the App JWT (sent ${seen[0].auth})`,
    );
    check(
      repos.length === 1 && repos[0].fullName === "acme/repo-1",
      "repo is mapped through",
    );
    check(repos[0].isPrivate === true, "private flag survives mapping");
    check(repos[0].primaryLanguage === "TypeScript", "language survives mapping");
  }

  /* ── Repos with metadata missing entirely ────────────────────────────────── */

  {
    // GitHub omits fields on some repos (and the mirror fallback has none of
    // them at all). Every default here was unpinned: the fixtures above always
    // supply metadata, so bumping `?? 0` to `?? 1` changed nothing.
    const [bare] = await fetchInstallationRepos(42, {
      tokenFor: async () => "t",
      fetchImpl: async () => ok({ repositories: [{ id: 5, full_name: "acme/bare" }] }),
    });
    check(bare.stars === 0, "a repo with no stargazers_count reports 0 stars");
    check(bare.primaryLanguage === null, "a repo with no language reports null");
    check(bare.isPrivate === false, "a repo with no private flag is treated as public");
    check(bare.isFork === false, "a repo with no fork flag is treated as a source repo");
    check(bare.description === null, "a repo with no description reports null");
  }

  /* ── Pagination: a selected-repo install is small, an org install is not ── */

  {
    const pages: string[] = [];
    const full = Array.from({ length: 100 }, (_, i) =>
      repo(i + 1, "2026-07-01T00:00:00Z"),
    );
    const repos = await fetchInstallationRepos(42, {
      tokenFor: async () => "t",
      fetchImpl: async (u) => {
        pages.push(u);
        return ok({ repositories: pages.length === 1 ? full : [repo(101)] });
      },
    });

    check(
      pages.length === 2,
      `a full page must be followed by page 2 (made ${pages.length} requests)`,
    );
    check(pages[1] === installationReposUrl(2), "the follow-up asks for page 2");
    check(repos.length === 101, `both pages are returned (got ${repos.length})`);
  }

  /* ── A refusal from GitHub must not read as "you have no repos" ─────────── */

  {
    let threw = false;
    try {
      await fetchInstallationRepos(42, {
        tokenFor: async () => "t",
        fetchImpl: async () => new Response("Not Found", { status: 404 }),
      });
    } catch (err) {
      threw = true;
      check(
        err instanceof Error && err.message.includes("404"),
        "the thrown error names the status so the log is actionable",
      );
    }
    check(
      threw,
      "a 404 must throw — swallowing it is what hid this bug for a release",
    );
  }

  /* ── Unknown timestamps sort last, not first ───────────────────────────── */

  {
    check(mapInstallationRepo(repo(7)).updatedAt === 0, "a missing updated_at becomes 0");
    check(
      mapInstallationRepo(repo(8, "not-a-date")).updatedAt === 0,
      "an unparseable date becomes 0",
    );

    const sorted = sortReposByRecency([
      mapInstallationRepo(repo(1)),
      mapInstallationRepo(repo(2, "2026-07-01T00:00:00Z")),
    ]);
    check(
      sorted[0].fullName === "acme/repo-2" && sorted[1].fullName === "acme/repo-1",
      "a repo with no known timestamp must not be sorted above a real one",
    );
  }

  /* ── One path for both repository_selection values ─────────────────────── */

  const routeSrc = readFileSync(
    path.join(__dirname, "../../app/api/github/repos/route.ts"),
    "utf8",
  );

  check(
    !/repository_selection\s*===/.test(routeSrc),
    "the repo route must not branch on repository_selection — that branch is the bug: " +
      "/installation/repositories already returns exactly the accessible set for both modes",
  );
  check(
    routeSrc.includes("fetchInstallationRepos"),
    "the repo route asks GitHub for the live list",
  );
  check(
    routeSrc.includes("readMirroredRepos"),
    "the mirror is still read as a fallback when GitHub fails",
  );

  console.log(`PASS installation-repos selfcheck (${checks} checks)`);
}

runSelfcheck(main, "installation-repos selfcheck");
