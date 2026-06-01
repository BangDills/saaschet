/**
 * Minimal GitHub REST API client for fetching public repo content.
 *
 * Works in two modes:
 * - **Unauthenticated**: 60 requests/hour shared per IP. Fine for occasional
 *   use of public repos.
 * - **Authenticated** (Bearer token): 5000 requests/hour per user. Used when
 *   the caller has signed in to our app via GitHub OAuth (Supabase stores
 *   the access token in `profiles.github_token`).
 *
 * We deliberately keep this tiny — no SDK dependency, just fetch.
 */

const GH_API = "https://api.github.com";
const GH_RAW = "https://raw.githubusercontent.com";

export type GitHubRepoInfo = {
  fullName: string; // "owner/repo"
  description: string | null;
  defaultBranch: string;
  primaryLanguage: string | null;
  stars: number;
  isPrivate: boolean;
  topics: string[];
};

export type GitHubFile = {
  path: string;
  type: "file" | "dir";
  size?: number;
};

export type GitHubRepoBundle = {
  info: GitHubRepoInfo;
  /** Top-level README markdown if present, else null */
  readme: string | null;
  /** Top-level package.json (or pyproject.toml/etc.) raw text, else null */
  manifest: { name: string; content: string } | null;
  /** Top-level entries in the repo, capped at 100 */
  files: GitHubFile[];
};

function authHeaders(token?: string): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "horizon-ai-saaschet",
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

/** Parse "owner/repo" or full GitHub URL into its parts. Returns null if not valid. */
export function parseRepoSlug(input: string): { owner: string; name: string } | null {
  const trimmed = input.trim();
  const match = trimmed.match(
    /^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/.*)?$/i,
  );
  if (!match) return null;
  return { owner: match[1], name: match[2] };
}

async function ghFetch(url: string, token?: string): Promise<Response> {
  return fetch(url, {
    headers: authHeaders(token),
    next: { revalidate: 1800 }, // 30-minute edge cache
  });
}

export async function fetchRepoInfo(
  owner: string,
  name: string,
  token?: string,
): Promise<GitHubRepoInfo> {
  const res = await ghFetch(`${GH_API}/repos/${owner}/${name}`, token);
  if (!res.ok) {
    throw new Error(`GitHub ${res.status}: ${await res.text().then((t) => t.slice(0, 200))}`);
  }
  const json = (await res.json()) as {
    full_name: string;
    description: string | null;
    default_branch: string;
    language: string | null;
    stargazers_count: number;
    private: boolean;
    topics?: string[];
  };
  return {
    fullName: json.full_name,
    description: json.description,
    defaultBranch: json.default_branch,
    primaryLanguage: json.language,
    stars: json.stargazers_count,
    isPrivate: json.private,
    topics: json.topics ?? [],
  };
}

/**
 * Fetch the rendered README. Uses the raw URL on the default branch since
 * that's CDN-cached and avoids one API call. Falls back to the API endpoint
 * (which respects different filename casings).
 */
export async function fetchReadme(
  owner: string,
  name: string,
  defaultBranch: string,
  token?: string,
): Promise<string | null> {
  // Try common cases on raw.githubusercontent.com first.
  const candidates = ["README.md", "readme.md", "Readme.md", "README"];
  for (const filename of candidates) {
    const url = `${GH_RAW}/${owner}/${name}/${defaultBranch}/${filename}`;
    const res = await fetch(url, { next: { revalidate: 1800 } });
    if (res.ok) return await res.text();
  }
  // Fallback to API readme endpoint (returns base64).
  try {
    const res = await ghFetch(`${GH_API}/repos/${owner}/${name}/readme`, token);
    if (!res.ok) return null;
    const json = (await res.json()) as { content?: string; encoding?: string };
    if (!json.content) return null;
    if (json.encoding === "base64") {
      return Buffer.from(json.content, "base64").toString("utf-8");
    }
    return json.content;
  } catch {
    return null;
  }
}

/** Fetch top-level file tree (one level deep). */
export async function fetchTopLevelFiles(
  owner: string,
  name: string,
  defaultBranch: string,
  token?: string,
): Promise<GitHubFile[]> {
  const res = await ghFetch(
    `${GH_API}/repos/${owner}/${name}/contents/?ref=${defaultBranch}`,
    token,
  );
  if (!res.ok) return [];
  const json = (await res.json()) as Array<{
    path: string;
    type: string;
    size?: number;
  }>;
  return json
    .slice(0, 100)
    .map((f) => ({
      path: f.path,
      type: f.type === "dir" ? "dir" : "file",
      size: f.size,
    }));
}

/** Try a few common manifest filenames; return the first that exists. */
const MANIFEST_FILES = [
  "package.json",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "Gemfile",
  "composer.json",
];

export async function fetchManifest(
  owner: string,
  name: string,
  defaultBranch: string,
): Promise<{ name: string; content: string } | null> {
  for (const filename of MANIFEST_FILES) {
    const url = `${GH_RAW}/${owner}/${name}/${defaultBranch}/${filename}`;
    const res = await fetch(url, { next: { revalidate: 1800 } });
    if (res.ok) {
      const text = await res.text();
      // Truncate very large manifests
      return { name: filename, content: text.slice(0, 4000) };
    }
  }
  return null;
}

/**
 * Fetch all the bits we want to feed the AI as repo context — info,
 * README, manifest, and top-level files — in parallel.
 */
export async function fetchRepoBundle(
  owner: string,
  name: string,
  token?: string,
): Promise<GitHubRepoBundle> {
  const info = await fetchRepoInfo(owner, name, token);
  const [readme, manifest, files] = await Promise.all([
    fetchReadme(owner, name, info.defaultBranch, token),
    fetchManifest(owner, name, info.defaultBranch),
    fetchTopLevelFiles(owner, name, info.defaultBranch, token),
  ]);
  return { info, readme, manifest, files };
}
