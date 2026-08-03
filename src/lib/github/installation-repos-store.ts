/**
 * Persistence for the installation → repo mirror (github_installation_repos).
 *
 * The mirror is no longer the source of truth. `/api/github/repos` asks GitHub
 * for the live list on every open, because that is the only answer that can't
 * drift, and it carries the metadata the picker renders (language, stars, last
 * push). The mirror exists so a GitHub hiccup degrades the picker instead of
 * blanking it, and so the webhook has somewhere to apply its deltas.
 *
 * Split out from installation-repos.ts on purpose: that file must stay
 * importable by a tsx selfcheck, and importing the Supabase admin client via
 * an `@/` alias would break it.
 */

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchInstallationRepos,
  type InstallationRepo,
} from "@/lib/github/installation-repos";

/**
 * Replace the mirrored repo list for one installation with GitHub's current
 * answer.
 *
 * Upsert-then-prune rather than delete-then-insert: a concurrent picker open
 * during a re-sync should never observe an empty table.
 *
 * Throws if GitHub refuses. Callers log; nobody should treat a failed sync as
 * "this user has no repositories".
 */
export async function syncInstallationRepos(
  rowId: string,
  installationId: number,
): Promise<InstallationRepo[]> {
  const repos = await fetchInstallationRepos(installationId);
  const admin = createAdminClient();

  if (repos.length > 0) {
    const { error } = await admin.from("github_installation_repos").upsert(
      repos.map((r) => ({
        installation_id: rowId,
        repo_id: r.id,
        full_name: r.fullName,
        is_private: r.isPrivate,
      })),
      { onConflict: "installation_id,repo_id" },
    );
    if (error) throw new Error(`mirror upsert failed: ${error.message}`);
  }

  // Drop rows for repos the installation can no longer see.
  const keep = repos.map((r) => r.id);
  const prune = admin
    .from("github_installation_repos")
    .delete()
    .eq("installation_id", rowId);
  const { error: pruneError } = await (keep.length > 0
    ? prune.not("repo_id", "in", `(${keep.join(",")})`)
    : prune);
  if (pruneError) throw new Error(`mirror prune failed: ${pruneError.message}`);

  return repos;
}

/**
 * Read the mirrored list. Metadata the table doesn't store comes back empty
 * and `updatedAt: 0` sorts those entries last — a degraded row is still an
 * importable row, which is the whole point of the fallback.
 */
export async function readMirroredRepos(
  rowId: string,
): Promise<InstallationRepo[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("github_installation_repos")
    .select("repo_id, full_name, is_private")
    .eq("installation_id", rowId);

  return (data ?? []).map((r) => ({
    id: Number(r.repo_id),
    fullName: r.full_name as string,
    description: null,
    primaryLanguage: null,
    stars: 0,
    isPrivate: Boolean(r.is_private),
    isFork: false,
    updatedAt: 0,
  }));
}
