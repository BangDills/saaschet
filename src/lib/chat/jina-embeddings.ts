/**
 * Embedding generation using Jina AI Embeddings v3 API (384 dimensions).
 * Requires JINA_API_KEY environment variable.
 */

export const EMBEDDING_DIMENSIONS = 384;

/**
 * Generate a 384-dimensional embedding for the given text using Jina AI.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) {
    console.warn("[jina-embeddings] JINA_API_KEY environment variable is not set. Returning zero-vector fallback.");
    return new Array(EMBEDDING_DIMENSIONS).fill(0);
  }

  const cleanText = text.trim().replace(/\n/g, " ");
  if (!cleanText) {
    return new Array(EMBEDDING_DIMENSIONS).fill(0);
  }

  try {
    const response = await fetch("https://api.jina.ai/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "jina-embeddings-v3",
        task: "text-matching",
        dimensions: EMBEDDING_DIMENSIONS,
        input: [cleanText],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const embedding = data?.data?.[0]?.embedding;
    
    if (!Array.isArray(embedding)) {
      throw new Error("Invalid response structure: expected an array in data[0].embedding");
    }

    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      console.warn(`[jina-embeddings] Warning: Jina API returned ${embedding.length} dimensions, expected ${EMBEDDING_DIMENSIONS}. Adjusting size.`);
      if (embedding.length > EMBEDDING_DIMENSIONS) {
        return embedding.slice(0, EMBEDDING_DIMENSIONS);
      } else {
        return [...embedding, ...new Array(EMBEDDING_DIMENSIONS - embedding.length).fill(0)];
      }
    }

    return embedding;
  } catch (err) {
    console.error("[jina-embeddings] Failed to generate embedding from Jina AI:", err);
    throw err;
  }
}
