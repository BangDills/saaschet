/**
 * List the repositories a GitHub App installation can actually see.
 *
 * There is exactly one endpoint for this, and it is easy to get wrong:
 *
 *   GET /installation/repositories        ← installation access token
 *
 * It is NOT `/app/installations/{id}/repositories` (that path does not exist —
 * GitHub answers 404) and it is not the App JWT that authenticates it. The JWT
 * only authenticates App-level routes such as `/app/installations/{id}`; the
 * repo list is installation-scoped, so it needs an installation token.
 *
 * That mistake is what broke "install with only selected repositories": the
 * 404 was swallowed, the mirror table stayed empty, and the picker reported
 * "no repositories accessible to the app" while an "all repositories" install
 * worked because it took a different code path.
 *
 * The endpoint needs no branching on `repository_selection` — it returns
 * exactly the accessible set either way, which is why both modes can now share
 * one path.
 *
 * Deliberately free of `@/` aliases and of any Supabase import so the
 * selfcheck can run this file directly under tsx. Persistence lives in
 * installation-repos-store.ts.
 */

import { getInstallationToken } from "./app-auth";

const GH_API = "https://api.github.com";

/** Guard against an unbounded loop if GitHub ever stops shrinking pages. */
const MAX_PAGES = 10;
const PER_PAGE = 100;

export type InstallationRepo = {
  /** GitHub's numeric repo id — the mirror table's natural key. */
  id: number;
  fullName: string;
  description: string | null;
  primaryLanguage: string | null;
  stars: number;
  isPrivate: boolean;
  isFork: boolean;
  /** ms since epoch */
  updatedAt: number;
};

type RawRepo = {
  id: number;
  full_name: string;
  description?: string | null;
  language?: string | null;
  stargazers_count?: number;
  private?: boolean;
  fork?: boolean;
  updated_at?: string;
};

/**
 * Normalize one API repo. `updated_at` is kept honest: an unparseable or
 * missing timestamp becomes 0, and callers sort those last rather than
 * rendering them as "Jan 01 1970" at the top.
 */
export function mapInstallationRepo(raw: RawRepo): InstallationRepo {
  const ts = raw.updated_at ? new Date(raw.updated_at).getTime() : 0;
  return {
    id: raw.id,
    fullName: raw.full_name,
    description: raw.description ?? null,
    primaryLanguage: raw.language ?? null,
    stars: raw.stargazers_count ?? 0,
    isPrivate: raw.private ?? false,
    isFork: raw.fork ?? false,
    updatedAt: Number.isFinite(ts) ? ts : 0,
  };
}

export function installationReposUrl(page: number): string {
  return `${GH_API}/installation/repositories?per_page=${PER_PAGE}&page=${page}`;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type InstallationReposDeps = {
  fetchImpl?: FetchLike;
  tokenFor?: (installationId: number) => Promise<string>;
};

/**
 * Fetch the live repo list for an installation, following pagination.
 *
 * Throws on a non-OK response. Callers decide what a failure means — the repo
 * picker falls back to the mirror table, the install callback just logs — but
 * nobody gets to silently treat "GitHub said no" as "the user has no repos".
 */
export async function fetchInstallationRepos(
  installationId: number,
  deps: InstallationReposDeps = {},
): Promise<InstallationRepo[]> {
  const doFetch = deps.fetchImpl ?? fetch;
  const token = await (deps.tokenFor ?? getInstallationToken)(installationId);

  const out: InstallationRepo[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await doFetch(installationReposUrl(page), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "celiuz-ai",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `GET /installation/repositories (installation ${installationId}) ` +
          `failed: ${res.status} ${body.slice(0, 200)}`,
      );
    }

    const json = (await res.json()) as { repositories?: RawRepo[] };
    const batch = json.repositories ?? [];
    for (const raw of batch) out.push(mapInstallationRepo(raw));

    if (batch.length < PER_PAGE) break;
  }

  return out;
}

/** Newest first, with unknown timestamps sorted last instead of first. */
export function sortReposByRecency(repos: InstallationRepo[]): InstallationRepo[] {
  return [...repos].sort((a, b) => b.updatedAt - a.updatedAt);
}
