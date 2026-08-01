import { createAdminClient } from "@/lib/supabase/admin";
import { getEmbedding } from "./jina-embeddings";
import { envNumber } from "@/lib/env";

/**
 * Search the user's memories semantically using Supabase pgvector cosine similarity.
 */
export async function searchMemories(
  userId: string,
  query: string,
  limit = 5,
  threshold = 0.7,
): Promise<string[]> {
  if (!query || !query.trim()) return [];

  try {
    // 1. Generate query embedding (local, no API key needed)
    const queryEmbedding = await getEmbedding(query);

    // 2. Query Supabase using match_memories RPC
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("match_memories", {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: limit,
      p_user_id: userId,
    });

    if (error) {
      console.error("[memory] search memories RPC error:", error.message);
      return [];
    }

    if (!Array.isArray(data)) return [];

    return data.map((item: { content: string }) => item.content);
  } catch (err) {
    // Graceful Fallback: If embedding or database call fails, warning-log it
    // and return an empty array [] so the main chat flow doesn't crash.
    console.warn("[memory] semantic search failed gracefully. Continuing chat without vector memories. Error:", err instanceof Error ? err.message : String(err));
    return [];
  }
}

/**
 * Save a new memory for the user.
 * Before saving, it checks if a similar memory already exists to avoid clutter.
 */
export async function saveMemory(userId: string, content: string): Promise<boolean> {
  // Collapse internal whitespace, not just the ends. The extractor works from
  // model output that sometimes wraps mid-sentence, which stored memories like
  // "...does not include Groq or scrape\n features".
  const cleanContent = content.replace(/\s+/g, " ").trim();
  if (!cleanContent) return false;

  try {
    // Check if we already have a highly similar memory. The threshold is
    // env-tunable because it is a recall/precision judgement with no obviously
    // right value: too high and paraphrases of the same fact pile up, too low
    // and genuinely distinct facts get swallowed.
    // Not an integer, and min 0 is meaningful: 0 treats everything as a
    // duplicate, which is a legitimate (if drastic) way to stop storing
    // memories. `|| 0.85` made that unreachable.
    const threshold = envNumber("MEMORY_DEDUPE_THRESHOLD", 0.85, { min: 0, max: 1 });
    const existing = await searchMemories(userId, cleanContent, 1, threshold);
    if (existing.length > 0) {
      console.log(`[memory] similar memory already exists, skipping: "${existing[0]}" vs "${cleanContent}"`);
      return false;
    }

    // 1. Generate embedding (local)
    const embedding = await getEmbedding(cleanContent);

    // 2. Save to user_memories
    const admin = createAdminClient();
    const { error } = await admin.from("user_memories").insert({
      user_id: userId,
      content: cleanContent,
      embedding,
    });

    if (error) {
      console.error("[memory] failed to insert memory:", error.message);
      return false;
    }

    console.log(`[memory] stored new memory for user ${userId}: "${cleanContent}"`);
    return true;
  } catch (err) {
    // Graceful Fallback: If embedding generation or DB write fails, log it and return false
    console.warn("[memory] failed to save memory gracefully. Error:", err instanceof Error ? err.message : String(err));
    return false;
  }
}
