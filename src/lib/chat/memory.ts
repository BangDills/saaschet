import { createAdminClient } from "@/lib/supabase/admin";
import { createOpenAI } from "@ai-sdk/openai";
import { embed } from "ai";

/**
 * Generate 1024-dimensional vector embedding for a given text using DigitalOcean Serverless Inference.
 * Uses process.env.DO_INFERENCE_API_KEY.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.DO_INFERENCE_API_KEY;
  if (!apiKey) {
    throw new Error("DO_INFERENCE_API_KEY is not set. Embedding generation requires DigitalOcean Inference API access.");
  }

  const baseUrl = process.env.DO_INFERENCE_BASE_URL ?? "https://inference.do-ai.run/v1";

  const doProvider = createOpenAI({
    apiKey,
    baseURL: baseUrl,
  });

  try {
    const { embedding } = await embed({
      model: doProvider.embedding("bge-large-en-v1.5"),
      value: text.trim().replace(/\n/g, " "),
    });
    return embedding;
  } catch (err) {
    console.error("[memory] failed to generate embedding:", err);
    throw err;
  }
}

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
    // 1. Generate query embedding
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
    console.error("[memory] failed to search memories:", err);
    return [];
  }
}

/**
 * Save a new memory for the user.
 * Before saving, it checks if a similar memory already exists to avoid clutter.
 */
export async function saveMemory(userId: string, content: string): Promise<boolean> {
  const cleanContent = content.trim();
  if (!cleanContent) return false;

  try {
    // Check if we already have a highly similar memory
    const existing = await searchMemories(userId, cleanContent, 1, 0.85);
    if (existing.length > 0) {
      console.log(`[memory] similar memory already exists, skipping: "${existing[0]}" vs "${cleanContent}"`);
      return false;
    }

    // 1. Generate embedding
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
    console.error("[memory] failed to save memory:", err);
    return false;
  }
}
