/**
 * Resolve which GitHub token a Celiuz AI user should act with.
 *
 * Lookup order (backward compatible during the OAuth → App migration):
 *   1. github_installations — user connected via the GitHub App; mint an
 *      installation token scoped to that installation's repos/permissions.
 *   2. profiles.github_token — legacy OAuth token. Remove once metrics
 *      show no active legacy users (see status route `mode` field).
 *   3. null — unauthenticated; public repos only, 60 req/h.
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
  mode: "app" | "legacy" | "none";
  /** Present when mode === "app". */
  installationId?: number;
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

  if (installations && installations.length > 0) {
    // With several installations (personal + org), prefer the one whose
    // account owns the repo being worked on. Falls back to the newest.
    const owner = repoFullName?.split("/")[0];
    const match =
      installations.find((i) => i.account_login === owner) ??
      installations[0];

    try {
      const token = await getInstallationToken(match.installation_id);
      return {
        token,
        mode: "app",
        installationId: match.installation_id,
        permissions: (match.permissions ?? {}) as Record<string, string>,
      };
    } catch (err) {
      // Installation may have been removed on GitHub's side before our
      // webhook cleaned up the row. Log and fall through to legacy so the
      // user isn't hard-blocked by a stale row.
      console.warn(
        "[github/app-client] installation token mint failed:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // Legacy fallback — DELETE THIS BLOCK in the Phase 3 cutover.
  const { data: profile } = await admin
    .from("profiles")
    .select("github_token")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.github_token) {
    return { token: profile.github_token, mode: "legacy" };
  }

  return { token: null, mode: "none" };
}

/**
 * Pre-flight guard for write tools. Without this, a missing permission
 * surfaces as a raw GitHub 403 deep inside an agent loop; with it, the
 * user gets an actionable error before any API call is made.
 *
 * No-op for legacy mode (OAuth scopes can't be inspected per-repo).
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
