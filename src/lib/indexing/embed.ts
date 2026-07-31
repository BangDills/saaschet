/**
 * Batch embedding for the repo index.
 *
 * The single-text getEmbedding() in src/lib/chat/jina-embeddings.ts serves
 * query-time needs; indexing embeds hundreds of chunks and would take
 * minutes one call at a time. Jina accepts an array of inputs per request,
 * so we batch ~96 texts per call.
 *
 * Unlike memory.ts we PRESERVE newlines — code structure carries meaning
 * that flattening would destroy.
 */

import { EMBEDDING_DIMENSIONS } from "@/lib/chat/jina-embeddings";

const JINA_URL = "https://api.jina.ai/v1/embeddings";
const BATCH_SIZE = 96;
const MAX_TEXT_CHARS = 8192; // Jina truncates beyond this anyway; be explicit

function zeroVector(): number[] {
  return new Array(EMBEDDING_DIMENSIONS).fill(0);
}

function normalize(text: string): string {
  // Trim trailing whitespace per line and cap length; keep newlines intact.
  return text
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

async function embedOneBatch(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) {
    throw new Error("JINA_API_KEY is not configured");
  }

  const response = await fetch(JINA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "jina-embeddings-v3",
      task: "text-matching",
      dimensions: EMBEDDING_DIMENSIONS,
      input: texts,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Jina embeddings API error: ${response.status} - ${errorText.slice(0, 300)}`,
    );
  }

  const data = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };

  if (!Array.isArray(data?.data) || data.data.length !== texts.length) {
    throw new Error(
      `Jina returned ${data?.data?.length ?? 0} embeddings for ${texts.length} inputs`,
    );
  }

  return data.data.map((d) => {
    const emb = d.embedding;
    if (!Array.isArray(emb)) return zeroVector();
    if (emb.length === EMBEDDING_DIMENSIONS) return emb;
    // Defensive size adjust (mirrors jina-embeddings.ts behavior)
    return emb.length > EMBEDDING_DIMENSIONS
      ? emb.slice(0, EMBEDDING_DIMENSIONS)
      : [...emb, ...new Array(EMBEDDING_DIMENSIONS - emb.length).fill(0)];
  });
}

/** Embed many texts, batching through the Jina API. Order is preserved. */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const normalized = texts.map(normalize);
  const out: number[][] = [];

  for (let i = 0; i < normalized.length; i += BATCH_SIZE) {
    const slice = normalized.slice(i, i + BATCH_SIZE);
    // Empty strings embed as zero vectors without an API round-trip.
    const embeddings = await embedOneBatch(
      slice.map((t) => (t.length > 0 ? t : " ")),
    );
    out.push(...embeddings);
  }

  return out;
}
