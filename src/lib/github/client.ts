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
    "User-Agent": "saaschet",
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



export type UserRepo = {
  fullName: string; // "owner/repo"
  description: string | null;
  primaryLanguage: string | null;
  stars: number;
  isPrivate: boolean;
  isFork: boolean;
  /** ms since epoch */
  updatedAt: number;
};

/**
 * List the authenticated user's accessible repositories.
 *
 * Includes owned + collaborator repos, sorted by most recently updated.
 * Caps at 100 (one page) — fine for the autocomplete UX. We don't paginate
 * because anyone with >100 active repos can still paste any slug manually.
 */
export async function fetchUserRepos(token: string): Promise<UserRepo[]> {
  const res = await fetch(
    `${GH_API}/user/repos?sort=updated&per_page=100&type=all`,
    {
      headers: authHeaders(token),
      next: { revalidate: 300 }, // 5-minute edge cache
    },
  );
  if (!res.ok) {
    throw new Error(
      `GitHub ${res.status}: ${await res.text().then((t) => t.slice(0, 200))}`,
    );
  }
  const json = (await res.json()) as Array<{
    full_name: string;
    description: string | null;
    language: string | null;
    stargazers_count: number;
    private: boolean;
    fork: boolean;
    updated_at: string;
  }>;
  return json.map((r) => ({
    fullName: r.full_name,
    description: r.description,
    primaryLanguage: r.language,
    stars: r.stargazers_count,
    isPrivate: r.private,
    isFork: r.fork,
    updatedAt: new Date(r.updated_at).getTime(),
  }));
}



/* ─────────────────────────────────────────────────────────────────────────
 * READ helpers used by Agent Mode tools
 * ────────────────────────────────────────────────────────────────────── */

/**
 * Fetch the raw content of a single file at a given ref.
 * Caps at 60KB so a malicious / huge file can't blow up the model context.
 */
export async function fetchFileContent(
  owner: string,
  name: string,
  filePath: string,
  ref: string,
  token?: string,
): Promise<{ content: string; truncated: boolean; sha: string }> {
  const res = await ghFetch(
    `${GH_API}/repos/${owner}/${name}/contents/${encodeURI(filePath)}?ref=${encodeURIComponent(ref)}`,
    token,
  );
  if (!res.ok) {
    throw new Error(
      `GitHub ${res.status} for ${filePath}: ${await res
        .text()
        .then((t) => t.slice(0, 200))}`,
    );
  }
  const json = (await res.json()) as {
    content?: string;
    encoding?: string;
    sha: string;
    type?: string;
  };
  if (json.type !== "file" || !json.content) {
    throw new Error(`Path ${filePath} is not a regular file`);
  }
  const decoded =
    json.encoding === "base64"
      ? Buffer.from(json.content, "base64").toString("utf-8")
      : json.content;
  const MAX = 60_000;
  if (decoded.length > MAX) {
    return { content: decoded.slice(0, MAX), truncated: true, sha: json.sha };
  }
  return { content: decoded, truncated: false, sha: json.sha };
}

/**
 * List directory entries at a given path. Empty `dirPath` lists the repo root.
 */
export async function fetchDirectoryListing(
  owner: string,
  name: string,
  dirPath: string,
  ref: string,
  token?: string,
): Promise<GitHubFile[]> {
  const url = dirPath
    ? `${GH_API}/repos/${owner}/${name}/contents/${encodeURI(dirPath)}?ref=${encodeURIComponent(ref)}`
    : `${GH_API}/repos/${owner}/${name}/contents/?ref=${encodeURIComponent(ref)}`;
  const res = await ghFetch(url, token);
  if (!res.ok) {
    throw new Error(
      `GitHub ${res.status}: ${await res.text().then((t) => t.slice(0, 200))}`,
    );
  }
  const json = (await res.json()) as Array<{
    path: string;
    type: string;
    size?: number;
  }>;
  return json
    .slice(0, 200)
    .map((f) => ({
      path: f.path,
      type: f.type === "dir" ? "dir" : "file",
      size: f.size,
    }));
}

/** Search code in a single repo via GitHub's code search API. */
export async function searchCode(
  owner: string,
  name: string,
  query: string,
  token?: string,
): Promise<Array<{ path: string; snippet: string }>> {
  // Note: GitHub's code search requires authentication.
  if (!token) return [];
  const fullQuery = `${query} repo:${owner}/${name}`;
  const res = await fetch(
    `${GH_API}/search/code?q=${encodeURIComponent(fullQuery)}&per_page=10`,
    { headers: authHeaders(token), next: { revalidate: 120 } },
  );
  if (!res.ok) {
    throw new Error(
      `GitHub search ${res.status}: ${await res.text().then((t) => t.slice(0, 200))}`,
    );
  }
  const json = (await res.json()) as {
    items?: Array<{
      path: string;
      text_matches?: Array<{ fragment?: string }>;
    }>;
  };
  return (json.items ?? []).map((item) => ({
    path: item.path,
    snippet:
      item.text_matches?.[0]?.fragment?.slice(0, 500) ?? "(no preview)",
  }));
}

/* ─────────────────────────────────────────────────────────────────────────
 * WRITE helpers used by Agent Mode tools (create branch, commit, PR)
 * ────────────────────────────────────────────────────────────────────── */

/**
 * Get the SHA the named branch points to.
 *
 * Returns `null` instead of throwing when the repo is empty (no commits
 * yet — GitHub returns 409 'Git Repository is empty.'). Callers can use
 * this to decide whether to bootstrap the first commit.
 */
export async function getBranchSha(
  owner: string,
  name: string,
  branch: string,
  token: string,
): Promise<string | null> {
  const res = await fetch(
    `${GH_API}/repos/${owner}/${name}/git/refs/heads/${encodeURIComponent(branch)}`,
    { headers: authHeaders(token), cache: "no-store" },
  );
  if (res.status === 409 || res.status === 404) {
    // 409 = repo empty, 404 = branch doesn't exist yet
    return null;
  }
  if (!res.ok) {
    throw new Error(
      `Get branch ${branch} failed: ${res.status} ${await res
        .text()
        .then((t) => t.slice(0, 200))}`,
    );
  }
  const json = (await res.json()) as { object: { sha: string } };
  return json.object.sha;
}

/** Create a new branch off `fromSha`. */
export async function createBranch(
  owner: string,
  name: string,
  newBranch: string,
  fromSha: string,
  token: string,
): Promise<void> {
  const res = await fetch(`${GH_API}/repos/${owner}/${name}/git/refs`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      ref: `refs/heads/${newBranch}`,
      sha: fromSha,
    }),
  });
  if (!res.ok && res.status !== 422) {
    // 422 = already exists; we treat that as idempotent.
    throw new Error(
      `Create branch ${newBranch} failed: ${res.status} ${await res
        .text()
        .then((t) => t.slice(0, 200))}`,
    );
  }
}

/**
 * Create-or-update a file on a branch. Returns the resulting commit SHA.
 *
 * If the file already exists, GitHub requires the previous blob SHA. We
 * fetch it transparently when the caller doesn't supply one.
 */
export async function putFile(
  owner: string,
  name: string,
  filePath: string,
  content: string,
  branch: string,
  message: string,
  token: string,
  existingSha?: string,
): Promise<{ commitSha: string }> {
  let sha = existingSha;
  if (!sha) {
    // Try to look it up — silently ignore 404 (file doesn't exist yet).
    const lookup = await fetch(
      `${GH_API}/repos/${owner}/${name}/contents/${encodeURI(filePath)}?ref=${encodeURIComponent(branch)}`,
      { headers: authHeaders(token), cache: "no-store" },
    );
    if (lookup.ok) {
      const j = (await lookup.json()) as { sha?: string };
      sha = j.sha;
    }
  }

  const res = await fetch(
    `${GH_API}/repos/${owner}/${name}/contents/${encodeURI(filePath)}`,
    {
      method: "PUT",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        content: Buffer.from(content, "utf-8").toString("base64"),
        branch,
        ...(sha ? { sha } : {}),
      }),
    },
  );

  if (!res.ok) {
    throw new Error(
      `Write ${filePath} failed: ${res.status} ${await res
        .text()
        .then((t) => t.slice(0, 200))}`,
    );
  }
  const json = (await res.json()) as { commit: { sha: string } };
  return { commitSha: json.commit.sha };
}

/** Open a pull request from `headBranch` into `baseBranch`. */
export async function createPullRequest(
  owner: string,
  name: string,
  headBranch: string,
  baseBranch: string,
  title: string,
  body: string,
  token: string,
): Promise<{ url: string; number: number }> {
  const res = await fetch(`${GH_API}/repos/${owner}/${name}/pulls`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      body,
      head: headBranch,
      base: baseBranch,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Open PR failed: ${res.status} ${await res
        .text()
        .then((t) => t.slice(0, 200))}`,
    );
  }
  const json = (await res.json()) as { html_url: string; number: number };
  return { url: json.html_url, number: json.number };
}



/**
 * Fetch the full git tree for a ref. With `recursive=1` GitHub returns up
 * to 100k entries in a single call. We cap and project to {path, type}.
 *
 * Skips paths that match the patterns most users don't want the agent
 * crawling into (heavy build artefacts, lockfiles, vendored deps).
 */
const SKIP_PREFIXES = [
  "node_modules/",
  ".next/",
  ".vercel/",
  "dist/",
  "build/",
  "out/",
  ".turbo/",
  "coverage/",
  ".cache/",
  "__pycache__/",
  "venv/",
  ".venv/",
  "target/",
];

const SKIP_PATHS = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "Cargo.lock",
  "poetry.lock",
  "Gemfile.lock",
  "composer.lock",
]);

function shouldSkip(path: string): boolean {
  if (SKIP_PATHS.has(path)) return true;
  for (const prefix of SKIP_PREFIXES) {
    if (path === prefix.slice(0, -1) || path.startsWith(prefix)) return true;
  }
  return false;
}

export async function fetchRecursiveTree(
  owner: string,
  name: string,
  ref: string,
  token?: string,
  options: { maxDepth?: number; maxEntries?: number; subPath?: string } = {},
): Promise<{ entries: GitHubFile[]; truncated: boolean }> {
  const { maxDepth = 3, maxEntries = 300, subPath = "" } = options;

  // Resolve ref → commit sha → tree sha.
  const refRes = await fetch(
    `${GH_API}/repos/${owner}/${name}/commits/${encodeURIComponent(ref)}`,
    { headers: authHeaders(token), cache: "no-store" },
  );
  if (!refRes.ok) {
    if (refRes.status === 404 || refRes.status === 409) {
      return { entries: [], truncated: false };
    }
    throw new Error(`Resolve ref ${ref} failed: ${refRes.status}`);
  }
  const refJson = (await refRes.json()) as { commit: { tree: { sha: string } } };
  const treeSha = refJson.commit.tree.sha;

  // Pull the recursive tree.
  const treeRes = await fetch(
    `${GH_API}/repos/${owner}/${name}/git/trees/${treeSha}?recursive=1`,
    { headers: authHeaders(token), next: { revalidate: 120 } },
  );
  if (!treeRes.ok) {
    throw new Error(`Tree fetch failed: ${treeRes.status}`);
  }
  const treeJson = (await treeRes.json()) as {
    tree: Array<{ path: string; type: string; size?: number }>;
    truncated?: boolean;
  };

  const prefix = subPath ? subPath.replace(/\/+$/, "") + "/" : "";

  const filtered: GitHubFile[] = [];
  for (const node of treeJson.tree) {
    if (filtered.length >= maxEntries) break;
    if (prefix && !node.path.startsWith(prefix)) continue;
    const relPath = prefix ? node.path.slice(prefix.length) : node.path;
    const depth = relPath.split("/").length;
    if (depth > maxDepth) continue;
    if (shouldSkip(node.path)) continue;
    filtered.push({
      path: node.path,
      type: node.type === "tree" ? "dir" : "file",
      ...(typeof node.size === "number" ? { size: node.size } : {}),
    });
  }

  return {
    entries: filtered,
    truncated: !!treeJson.truncated || filtered.length >= maxEntries,
  };
}
