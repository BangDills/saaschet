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

// Jina entry plans cap ~100K tokens/minute. A full 96-chunk batch can
// approach that in one call, so pace batches and back off on 429.
const MIN_BATCH_GAP_MS = 6500; // ~9 batches/minute ceiling
const MAX_429_RETRIES = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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

  let response: Response | null = null;
  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    response = await fetch(JINA_URL, {
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

    if (response.status !== 429) break;

    if (attempt === MAX_429_RETRIES) {
      if (texts.length > 1) {
        const mid = Math.ceil(texts.length / 2);
        const [a, b] = await Promise.all([
          embedOneBatch(texts.slice(0, mid)),
          embedOneBatch(texts.slice(mid)),
        ]);
        return [...a, ...b];
      }
      break;
    }

    const backoffMs = 15_000 * Math.pow(2, attempt);
    console.warn(`[indexing/embed] Jina 429 — retry in ${backoffMs / 1000}s (${attempt + 1}/${MAX_429_RETRIES})`);
    await sleep(backoffMs);
  }

  if (!response || !response.ok) {
    const errorText = response ? await response.text() : "no response";
    throw new Error(
      `Jina embeddings API error: ${response?.status} - ${errorText.slice(0, 300)}`,
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

    // Pace batches to stay under the per-minute token cap (skip after last).
    if (i + BATCH_SIZE < normalized.length) {
      await sleep(MIN_BATCH_GAP_MS);
    }
  }

  return out;
}
