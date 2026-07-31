/**
 * GitHub App authentication — JWT signing + installation token minting.
 *
 * GitHub Apps authenticate in two steps:
 *   1. Sign a short-lived JWT (10 min max) with the App's private key
 *      (RS256). This proves "we are the App".
 *   2. Exchange it for an installation access token (1 hour) scoped to one
 *      installation's repos + permissions. This is what client.ts helpers
 *      receive as their `token` argument.
 *
 * We never store tokens. Installation tokens are minted on demand and
 * cached in process memory until shortly before expiry. No SDK — just
 * fetch + node's crypto, matching the rest of src/lib/github.
 */

import crypto from "crypto";

const GH_API = "https://api.github.com";

/* ── Config ─────────────────────────────────────────────────────────── */

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

export function githubAppId(): string {
  return requireEnv("GITHUB_APP_ID");
}

/**
 * The private key arrives from env either with real newlines (Coolify
 * multiline vars) or with literal \n sequences (single-line vars).
 * Normalize to real newlines before use.
 */
function privateKeyPem(): string {
  return requireEnv("GITHUB_APP_PRIVATE_KEY").replace(/\\n/g, "\n");
}

/* ── Step 1: App JWT ────────────────────────────────────────────────── */

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Create a JWT authenticating as the App itself. GitHub allows 10 minutes
 * max; we use 9 and backdate `iat` by 60s to tolerate clock skew.
 */
export function createAppJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iat: now - 60,
      exp: now + 9 * 60,
      iss: githubAppId(),
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signature = crypto.sign(
    "RSA-SHA256",
    Buffer.from(unsigned),
    privateKeyPem(),
  );
  return `${unsigned}.${base64url(signature)}`;
}

/* ── Step 2: Installation tokens (cached) ───────────────────────────── */

type CachedToken = { token: string; expiresAt: number };

/**
 * Process-local cache keyed by installation id. Same single-replica
 * tradeoff as run-registry — worst case on a fresh process is one extra
 * token mint. Tokens expire in 1h and are scoped to the installation's
 * repos, so the blast radius of a leaked cache entry is small.
 */
const tokenCache = new Map<number, CachedToken>();

const EXPIRY_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before real expiry

/**
 * Mint (or reuse a cached) installation access token.
 *
 * The token inherits the installation's permissions and repo selection —
 * no GITHUB_TOKEN env var, no user OAuth token, nothing long-lived.
 *
 * Throws on 404/401 — callers should treat that as "the installation was
 * removed on GitHub's side" and clean up the DB row.
 */
export async function getInstallationToken(
  installationId: number,
): Promise<string> {
  const cached = tokenCache.get(installationId);
  if (cached && cached.expiresAt - EXPIRY_BUFFER_MS > Date.now()) {
    return cached.token;
  }

  const res = await fetch(
    `${GH_API}/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${createAppJwt()}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "celiuz-ai",
      },
      cache: "no-store",
    },
  );

  if (!res.ok) {
    throw new Error(
      `Installation token mint failed (${installationId}): ${res.status} ${await res
        .text()
        .then((t) => t.slice(0, 200))}`,
    );
  }

  const json = (await res.json()) as { token: string; expires_at: string };
  tokenCache.set(installationId, {
    token: json.token,
    expiresAt: new Date(json.expires_at).getTime(),
  });
  return json.token;
}

/**
 * Drop a cached token — e.g. after a 401 from GitHub, which can mean the
 * token was revoked early (user uninstalled, permission change). The next
 * getInstallationToken call will mint a fresh one.
 */
export function invalidateInstallationToken(installationId: number): void {
  tokenCache.delete(installationId);
}
