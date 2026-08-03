/**
 * Resolve which GitHub token a Celiuz AI user should act with.
 *
 * Post-cutover (Phase 3): the only source is github_installations — the
 * user connected via the GitHub App, so we mint an installation token
 * scoped to that installation's repos/permissions. Returns null when no
 * installation exists (unauthenticated; public repos only, 60 req/h).
 *
 * This module is server-only: it reads via the service-role admin client
 * and must never be imported from a Client Component.
 */

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getInstallationToken } from "./app-auth";

export type ResolvedGitHubAuth = {
  /** Token to pass into client.ts helpers; null = unauthenticated. */
  token: string | null;
  mode: "app" | "none";
  /** Present when mode === "app". */
  installationId?: number;
  /**
   * The account the chosen installation belongs to. An installation token is
   * scoped to that account's repos and returns 404 for anything else — even a
   * public repo — so callers that may be handed an arbitrary slug must compare
   * this against the repo owner before using the token, and fall back to
   * anonymous access when it doesn't match.
   */
  accountLogin?: string;
  /** Permissions granted to the installation, e.g. { contents: "write" }. */
  permissions?: Record<string, string>;
};

export async function resolveGitHubAuth(
  userId: string,
  repoFullName?: string, // "owner/repo" — picks the matching installation
): Promise<ResolvedGitHubAuth> {
  const admin = createAdminClient();

  const { data: installations } = await admin
    .from("github_installations")
    .select("installation_id, account_login, permissions")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (!installations || installations.length === 0) {
    return { token: null, mode: "none" };
  }

  // With several installations (personal + org), prefer the one whose
  // account owns the repo being worked on. Falls back to the newest.
  const owner = repoFullName?.split("/")[0];
  const match =
    installations.find((i) => i.account_login === owner) ??
    installations[0];

  const token = await getInstallationToken(match.installation_id);
  return {
    token,
    mode: "app",
    installationId: match.installation_id,
    accountLogin: match.account_login,
    permissions: (match.permissions ?? {}) as Record<string, string>,
  };
}

/**
 * Pre-flight guard for write tools. Without this, a missing permission
 * surfaces as a raw GitHub 403 deep inside an agent loop; with it, the
 * user gets an actionable error before any API call is made.
 */
export function assertPermission(
  auth: ResolvedGitHubAuth,
  key: "contents" | "pull_requests" | "workflows" | "checks" | string,
  level: "read" | "write",
): void {
  if (auth.mode !== "app") return;
  const granted = auth.permissions?.[key];
  const ok = level === "read" ? !!granted : granted === "write";
  if (!ok) {
    throw new Error(
      `The connected GitHub App lacks '${key}: ${level}'. ` +
        `An admin can update its permissions at https://github.com/settings/installations — ` +
        `after accepting the new permissions there, reconnect GitHub here.`,
    );
  }
}
