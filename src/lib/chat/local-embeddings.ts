import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

/**
 * Local embedding generation using Supabase/gte-small (384 dimensions).
 * Runs entirely in-process via ONNX Runtime WASM backend — no native
 * binaries required, works on any platform (Vercel, Docker, VPS, etc.).
 *
 * The model (~30MB) is downloaded once on first use and cached on disk.
 * A singleton pipeline is shared across all requests.
 */

let _pipe: FeatureExtractionPipeline | null = null;
let _loading: Promise<FeatureExtractionPipeline> | null = null;

/**
 * Lazy-load the embedding pipeline (singleton with mutex).
 * Concurrent callers await the same loading promise.
 */
async function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (_pipe) return _pipe;
  if (_loading) return _loading;

  console.log("[local-embeddings] Loading Supabase/gte-small model (WASM backend)...");
  _loading = pipeline("feature-extraction", "Supabase/gte-small", {
    // Use WASM backend — pure JavaScript, no native .so/.dylib needed.
    // This avoids the "libonnxruntime.so.1: cannot open shared object file"
    // error on platforms where onnxruntime-node native binaries are missing.
    device: "wasm",
  })
    .then((p) => {
      _pipe = p;
      console.log("[local-embeddings] Model loaded successfully");
      return p;
    })
    .catch((err) => {
      // Clear mutex so next call can retry
      _loading = null;
      throw err;
    });

  return _loading;
}

/**
 * Generate a 384-dimensional embedding for the given text.
 * Uses mean pooling + L2 normalization (same as the original gte-small training).
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const pipe = await getPipeline();
  const output = await pipe(text.trim().replace(/\n/g, " "), {
    pooling: "mean",
    normalize: true,
  });
  return Array.from(output.data as Float32Array);
}

/** The dimensionality of the embedding vectors produced by this model. */
export const EMBEDDING_DIMENSIONS = 384;
