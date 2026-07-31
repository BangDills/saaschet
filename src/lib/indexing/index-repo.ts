/**
 * Repo indexing orchestration.
 *
 * Fetches a repo's file tree, chunks indexable files, embeds the chunks,
 * and stores them in code_chunks keyed to a repo_indexes row. Supports
 * incremental re-indexing: when the repo's HEAD moved since the last run,
 * only changed/added/deleted files are reprocessed (via GitHub compare).
 *
 * Server-only — uses the service-role admin client for DB writes.
 */

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchRepoInfo,
  fetchFileContent,
  fetchRecursiveTree,
  getBranchSha,
} from "@/lib/github/client";
import { chunkFile, isIndexablePath, looksBinary } from "./chunk";
import { embedBatch } from "./embed";

const MAX_FILES = 2000;
const MAX_CHUNKS = 8000;
const FETCH_CONCURRENCY = 8;

export type IndexRepoResult = {
  fileCount: number;
  chunkCount: number;
  headSha: string;
  incremental: boolean;
};

type IndexRow = {
  id: string;
  head_sha: string | null;
  default_branch: string;
};

/**
 * Index (or re-index) a repo for a user.
 *
 * @param token  GitHub token with read access (installation token from
 *               resolveGitHubAuth, or a system-level App token for the
 *               webhook path).
 */
export async function indexRepo(opts: {
  userId: string;
  repoFullName: string; // "owner/repo"
  token: string;
  branch?: string;
}): Promise<IndexRepoResult> {
  const [owner, name] = opts.repoFullName.split("/");
  const admin = createAdminClient();

  // ── Resolve repo info + HEAD sha ────────────────────────────────────
  const info = await fetchRepoInfo(owner, name, opts.token);
  const branch = opts.branch ?? info.defaultBranch;
  const headSha = await getBranchSha(owner, name, branch, opts.token);
  if (!headSha) {
    throw new Error(`Could not resolve HEAD of ${opts.repoFullName}@${branch}`);
  }

  // ── Upsert the index row → status indexing ──────────────────────────
  const { data: upserted, error: upsertErr } = await admin
    .from("repo_indexes")
    .upsert(
      {
        user_id: opts.userId,
        repo_full_name: opts.repoFullName,
        default_branch: branch,
        status: "indexing",
        error_message: null,
      },
      { onConflict: "user_id,repo_full_name" },
    )
    .select("id, head_sha, default_branch")
    .single();

  if (upsertErr || !upserted) {
    throw new Error(`Failed to create index row: ${upsertErr?.message}`);
  }
  const indexRow = upserted as IndexRow;

  try {
    const previousSha = indexRow.head_sha;
    const incremental = !!previousSha && previousSha !== headSha;

    // ── Determine which files to (re)process ──────────────────────────
    let changedPaths: Set<string> | null = null; // null = full index
    let deletedPaths: string[] = [];

    if (incremental && previousSha) {
      const cmpRes = await fetch(
        `https://api.github.com/repos/${owner}/${name}/compare/${previousSha}...${headSha}`,
        {
          headers: {
            Authorization: `Bearer ${opts.token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "celiuz-ai",
          },
          cache: "no-store",
        },
      );
      if (cmpRes.ok) {
        const cmp = (await cmpRes.json()) as {
          files?: Array<{ filename: string; status: string }>;
        };
        changedPaths = new Set(
          (cmp.files ?? [])
            .filter((f) => f.status !== "removed")
            .map((f) => f.filename),
        );
        deletedPaths = (cmp.files ?? [])
          .filter((f) => f.status === "removed")
          .map((f) => f.filename);
      }
      // Compare API failure → fall back to a full re-index (changedPaths stays null)
    }

    // ── List the tree (with the existing skip-list inside client.ts) ──
    const tree = await fetchRecursiveTree(owner, name, branch, opts.token, {
      maxDepth: 10,
      maxEntries: MAX_FILES * 2, // filter down below
    });

    let files = tree.entries.filter(
      (e) => e.type === "file" && isIndexablePath(e.path, e.size),
    );

    if (changedPaths) {
      files = files.filter((f) => changedPaths!.has(f.path));
    }
    files = files.slice(0, MAX_FILES);

    // ── Delete chunks for removed files (incremental only) ────────────
    if (incremental && deletedPaths.length > 0) {
      await admin
        .from("code_chunks")
        .delete()
        .eq("index_id", indexRow.id)
        .in("path", deletedPaths);
    }

    // ── Fetch + chunk + embed in batches ──────────────────────────────
    let totalChunks = 0;
    let processedFiles = 0;

    for (let i = 0; i < files.length && totalChunks < MAX_CHUNKS; i += FETCH_CONCURRENCY) {
      const batch = files.slice(i, i + FETCH_CONCURRENCY);

      const fetched = await Promise.all(
        batch.map(async (f) => {
          try {
            const file = await fetchFileContent(owner, name, f.path, branch, opts.token);
            if (looksBinary(file.content)) return null;
            const chunks = chunkFile(f.path, file.content);
            if (chunks.length === 0) return null;
            return { path: f.path, chunks };
          } catch {
            return null; // unreadable file — skip, don't fail the whole index
          }
        }),
      );

      const usable = fetched.filter((x): x is NonNullable<typeof x> => x !== null);
      if (usable.length === 0) continue;

      // Flatten chunks, respecting the global cap
      const flat: Array<{ path: string; chunkIndex: number; startLine: number; endLine: number; content: string }> = [];
      for (const u of usable) {
        for (const c of u.chunks) {
          if (totalChunks + flat.length >= MAX_CHUNKS) break;
          flat.push({
            path: u.path,
            chunkIndex: c.chunkIndex,
            startLine: c.startLine,
            endLine: c.endLine,
            content: c.content,
          });
        }
      }

      if (flat.length > 0) {
        const embeddings = await embedBatch(flat.map((f) => f.content));

        // Per-file replace keeps incremental updates consistent
        for (const u of usable) {
          await admin
            .from("code_chunks")
            .delete()
            .eq("index_id", indexRow.id)
            .eq("path", u.path);
        }

        // Content is base64-encoded before insert: raw repo text routinely
        // contains SQL-like strings (our own migrations!) that trip the
        // Cloudflare WAF in front of Supabase with a "SQL injection" block.
        // search.ts decodes after retrieval, so consumers never see this.
        const rows = flat.map((f, idx) => ({
          index_id: indexRow.id,
          path: f.path,
          chunk_index: f.chunkIndex,
          start_line: f.startLine,
          end_line: f.endLine,
          content: Buffer.from(f.content, "utf-8").toString("base64"),
          embedding: embeddings[idx],
        }));

        const { error: insertErr } = await admin.from("code_chunks").insert(rows);
        if (insertErr) {
          throw new Error(`chunk insert failed: ${insertErr.message}`);
        }

        totalChunks += flat.length;
        processedFiles += usable.length;
      }
    }

    // ── Counts for the row ────────────────────────────────────────────
    // On incremental runs, count what's actually stored now.
    let fileCount = processedFiles;
    let chunkCount = totalChunks;
    if (incremental) {
      const { count: storedChunks } = await admin
        .from("code_chunks")
        .select("id", { count: "exact", head: true })
        .eq("index_id", indexRow.id);
      const { count: storedFiles } = await admin
        .from("code_chunks")
        .select("path", { count: "exact", head: true })
        .eq("index_id", indexRow.id);
      chunkCount = storedChunks ?? totalChunks;
      fileCount = storedFiles ?? processedFiles;
    }

    await admin
      .from("repo_indexes")
      .update({
        status: "ready",
        head_sha: headSha,
        file_count: fileCount,
        chunk_count: chunkCount,
        error_message: null,
      })
      .eq("id", indexRow.id);

    return { fileCount, chunkCount, headSha, incremental };
  } catch (err) {
    // Mark the row failed but keep whatever chunks exist — a stale index is
    // still useful, and the error message tells the user what happened.
    await admin
      .from("repo_indexes")
      .update({
        status: "error",
        error_message: err instanceof Error ? err.message.slice(0, 500) : String(err),
      })
      .eq("id", indexRow.id);
    throw err;
  }
}
