/**
 * Query-time semantic search over a user's indexed repo.
 *
 * Returns file POINTERS (path + line range + snippet), not answers — the
 * agent decides whether to read the full file via read_file, which stays
 * the authority on current content.
 */

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getEmbedding } from "@/lib/chat/jina-embeddings";

export type CodebaseHit = {
  path: string;
  startLine: number;
  endLine: number;
  content: string;
  similarity: number;
};

const DEFAULT_THRESHOLD = 0.45; // looser than memories (0.7): code embeds denser

export async function searchCodebase(opts: {
  userId: string;
  repoFullName: string;
  query: string;
  limit?: number;
}): Promise<CodebaseHit[]> {
  const query = opts.query.trim();
  if (!query) return [];

  const embedding = await getEmbedding(query);

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("match_code_chunks", {
    query_embedding: embedding,
    match_threshold: DEFAULT_THRESHOLD,
    match_count: Math.min(Math.max(opts.limit ?? 8, 1), 20),
    p_user_id: opts.userId,
    p_repo_full_name: opts.repoFullName,
  });

  if (error) {
    console.error("[indexing] match_code_chunks RPC error:", error.message);
    return [];
  }

  // Content is stored base64-encoded to keep raw repo text (which often
  // contains SQL-like strings) from tripping the Cloudflare WAF on insert.
  // Decode back to UTF-8 here so callers get readable snippets. Entries
  // that fail to decode (legacy plaintext rows) pass through unchanged.
  const hits = ((data ?? []) as CodebaseHit[]).map((h) => {
    try {
      const decoded = Buffer.from(h.content, "base64").toString("utf-8");
      // Round-trip check: only accept the decode if it re-encodes cleanly,
      // otherwise the row was legacy plaintext.
      if (Buffer.from(decoded, "utf-8").toString("base64").replace(/=+$/, "") ===
          h.content.replace(/=+$/, "")) {
        return { ...h, content: decoded };
      }
    } catch {
      // fall through — treat as plaintext
    }
    return h;
  });

  return hits;
}

/** Compact, token-frugal formatting for the model. */
export function formatHitsForModel(
  repoFullName: string,
  hits: CodebaseHit[],
): string {
  if (hits.length === 0) {
    return `No indexed chunks matched. The index may not cover this yet — fall back to directory listing / search_code / read_file.`;
  }

  const lines = hits.map((h, i) => {
    const snippet =
      h.content.length > 600 ? h.content.slice(0, 600) + "\n…" : h.content;
    return [
      `### ${i + 1}. ${h.path}:L${h.startLine}-L${h.endLine} (similarity ${h.similarity.toFixed(2)})`,
      "```",
      snippet,
      "```",
    ].join("\n");
  });

  return [
    `Found ${hits.length} relevant chunk(s) in ${repoFullName}.`,
    `These are pointers from the semantic index — use read_file on a path for full, current file content.`,
    "",
    ...lines,
  ].join("\n");
}
