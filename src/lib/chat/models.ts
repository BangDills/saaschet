import type { ModelInfo } from "./types";

/**
 * Vendor display order in the model selector.
 */
export const vendorOrder = [
  "OpenAI",
  "DeepSeek",
  "GLM",
  "Qwen",
  "Kimi",
  "MiniMax",
] as const;

/**
 * Model IDs that are NOT chat models and should be excluded from the
 * selector. Embedding, image-gen, TTS, reranker, video, and router models.
 */
const NON_CHAT_PATTERNS = [
  "embedding",
  "reranker",
  "gpt-image",
  "stable-diffusion",
  "wan2",
  "tts",
  "router:",
  "all-mini-lm",
  "bge-",
  "e5-large",
  "gte-large",
  "multi-qa",
  "gpt-oss-",    // fine-tuning base models, not chat
];

/** Returns true when the model id is NOT a chat model. */
export function isNonChatModel(id: string): boolean {
  const lower = id.toLowerCase();
  return NON_CHAT_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Model IDs that are known to handle tool-calling well and are suitable
 * for Agent Mode (multi-step coding tasks with GitHub + sandbox tools).
 *
 * Criteria: strong reasoning, reliable tool calling, large output window,
 * good at code generation and understanding.
 */
export const agentCapableModels = new Set([
  // OpenAI Codex (ChatGPT subscription)
  "codex/gpt-5.5",

  // Fireworks AI — all support function-calling per Fireworks docs (verified)
  "accounts/fireworks/models/glm-5p2",
  "accounts/fireworks/models/kimi-k2p7-code",
  "accounts/fireworks/models/minimax-m3",
  "accounts/fireworks/models/deepseek-v4-flash",
  "accounts/fireworks/models/deepseek-v4-pro",
  "accounts/fireworks/models/qwen3p7-plus",
]);

/** Check if a model is suitable for agent mode (tool calling). */
export function isAgentCapable(modelId: string): boolean {
  return agentCapableModels.has(modelId);
}

/**
 * Model IDs that support vision/multimodal input.
 */
export const multimodalModels = new Set([
  "codex/gpt-5.5",
  "accounts/fireworks/models/qwen3p7-plus",
  "accounts/fireworks/models/minimax-m3",
  "accounts/fireworks/models/kimi-k2p7-code",
]);

/** Check if a model supports vision/multimodal input. */
export function isMultimodal(modelId: string): boolean {
  return multimodalModels.has(modelId);
}

/* ─────────────────────────────────────────────────────────────────────────
 * Multi-provider routing helpers
 *
 * Model IDs use a prefix convention: "provider/model-id" (e.g. "codex/gpt-5.5").
 * Fireworks model IDs already include the "accounts/fireworks/models/" path
 * and need no extra prefix — resolveProvider detects them by that path.
 * Models without a recognized prefix route to Fireworks (the default provider).
 * ────────────────────────────────────────────────────────────────────── */

type ProviderName = "fireworks" | "codex";

const PROVIDER_PREFIXES: Record<string, ProviderName> = {
  "codex/": "codex",
};

/** Resolve which provider a model routes through. */
export function resolveProvider(modelId: string): ProviderName {
  if (modelId.startsWith("accounts/fireworks/")) return "fireworks";
  for (const [prefix, provider] of Object.entries(PROVIDER_PREFIXES)) {
    if (modelId.startsWith(prefix)) return provider;
  }
  return "fireworks";
}

/** Strip the provider prefix to get the raw model ID for the API. */
export function stripProviderPrefix(modelId: string): string {
  for (const prefix of Object.keys(PROVIDER_PREFIXES)) {
    if (modelId.startsWith(prefix)) return modelId.slice(prefix.length);
  }
  return modelId;
}

/** Base URLs for each provider. */
export const PROVIDER_BASE_URLS: Record<ProviderName, string> = {
  fireworks: "https://api.fireworks.ai/inference/v1",
  codex: "https://chatgpt.com/backend-api/codex",
};

/**
 * Per-model max output tokens, from Fireworks docs. A request whose
 * max_tokens exceeds the model's cap is rejected or clamped, so we cap
 * our requested maxOutputTokens to these values. Codex is excluded
 * (chat route doesn't set maxOutputTokens for it).
 */
export const MODEL_MAX_OUTPUT_TOKENS: Record<string, number> = {
  "accounts/fireworks/models/glm-5p2": 131072,
  "accounts/fireworks/models/deepseek-v4-flash": 131072,
  "accounts/fireworks/models/deepseek-v4-pro": 131072,
  "accounts/fireworks/models/kimi-k2p7-code": 32768,
  "accounts/fireworks/models/minimax-m3": 64000,
  "accounts/fireworks/models/qwen3p7-plus": 4000,
};

/** Max output tokens for a model, clamped to the model's documented cap. */
export function maxOutputFor(
  modelId: string,
  /** Requested tokens for this turn (agent vs chat default). */
  requested: number,
): number {
  const cap = MODEL_MAX_OUTPUT_TOKENS[modelId];
  return cap ? Math.min(requested, cap) : requested;
}

/** Environment variable names for each provider's API key. */
export const PROVIDER_ENV_KEYS: Record<ProviderName, string> = {
  fireworks: "FIREWORKS_API_KEY",
  codex: "", // Uses per-user OAuth tokens, not a server-side env key
};

/**
 * OpenAI Codex models — require the user to connect their ChatGPT account
 * via OAuth Device Code flow. Always included in the model list.
 */
export const codexModels: ModelInfo[] = [
  {
    id: "codex/gpt-5.5",
    label: "GPT-5.5",
    vendor: "OpenAI",
    tag: "ChatGPT subscription",
    agentCapable: true,
    provider: "codex",
    requiresAuth: true,
    multimodal: true,
  },
];

/**
 * Curated default model catalog for Fireworks AI.
 *
 * The full live list is fetched at runtime from /api/models, which proxies
 * GET https://api.fireworks.ai/inference/v1/models. This static list is shown
 * immediately while the live fetch is in flight (and serves as a fallback
 * if the upstream is down). Fireworks models are listed first so the default
 * model is not the auth-gated Codex entry.
 */
export const defaultModels: ModelInfo[] = [
  // ── Fireworks AI (default provider) ──
  {
    id: "accounts/fireworks/models/glm-5p2",
    label: "GLM 5.2",
    vendor: "GLM",
    tag: "Agent · Default",
    agentCapable: true,
    provider: "fireworks",
  },
  {
    id: "accounts/fireworks/models/kimi-k2p7-code",
    label: "Kimi 2.7 Code",
    vendor: "Kimi",
    tag: "Strong Coder",
    agentCapable: true,
    multimodal: true,
    provider: "fireworks",
  },
  {
    id: "accounts/fireworks/models/minimax-m3",
    label: "MiniMax M3",
    vendor: "MiniMax",
    tag: "Balanced",
    agentCapable: true,
    multimodal: true,
    provider: "fireworks",
  },
  {
    id: "accounts/fireworks/models/deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    vendor: "DeepSeek",
    tag: "Fast",
    agentCapable: true,
    provider: "fireworks",
  },
  {
    id: "accounts/fireworks/models/deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    vendor: "DeepSeek",
    tag: "Reasoning Pro",
    agentCapable: true,
    provider: "fireworks",
  },
  {
    id: "accounts/fireworks/models/qwen3p7-plus",
    label: "Qwen 3.7 Plus",
    vendor: "Qwen",
    tag: "Speed & Quality",
    agentCapable: true,
    multimodal: true,
    provider: "fireworks",
  },

  // ── OpenAI Codex (requires ChatGPT subscription OAuth) ──
  ...codexModels,
];

export const defaultModelId = defaultModels[0].id;
