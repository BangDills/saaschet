import type { ModelInfo } from "./types";

/**
 * Vendor display order in the model selector.
 */
export const vendorOrder = [
  "OpenAI",
  "DeepSeek",
  "Kimi",
  "GLM",
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

  // DeepSeek
  "deepseek-v4-pro",
  "deepseek-4-flash",

  // OpenCode free
  "opencode/deepseek-v4-flash-free",

  // Kimi — tool calling fixed via kimi-compat.ts
  "kimi-k2.6",
  "kimi-k2.5",

  // GLM — DO categorizes as tool-calling capable
  "glm-5",
]);

/** Check if a model is suitable for agent mode (tool calling). */
export function isAgentCapable(modelId: string): boolean {
  return agentCapableModels.has(modelId);
}

/* ─────────────────────────────────────────────────────────────────────────
 * Multi-provider routing helpers
 *
 * Model IDs use a prefix convention: "provider/model-id".
 * Models without a prefix route to DigitalOcean (the default provider).
 * ────────────────────────────────────────────────────────────────────── */

type ProviderName = "digitalocean" | "opencode" | "codex";

const PROVIDER_PREFIXES: Record<string, ProviderName> = {
  "opencode/": "opencode",
  "codex/": "codex",
};

/** Resolve which provider a model routes through. */
export function resolveProvider(modelId: string): ProviderName {
  for (const [prefix, provider] of Object.entries(PROVIDER_PREFIXES)) {
    if (modelId.startsWith(prefix)) return provider;
  }
  return "digitalocean";
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
  digitalocean: "https://inference.do-ai.run/v1",
  opencode: "https://opencode.ai/zen/v1",
  codex: "https://api.openai.com/v1",
};

/** Environment variable names for each provider's API key. */
export const PROVIDER_ENV_KEYS: Record<ProviderName, string> = {
  digitalocean: "DO_INFERENCE_API_KEY",
  opencode: "OPENCODE_API_KEY",
  codex: "", // Uses per-user OAuth tokens, not a server-side env key
};

/**
 * Known OpenCode Zen free models. These don't require payment — only a
 * free OpenCode account for the API key.
 */
export const opencodeFreeMod: ModelInfo[] = [
  {
    id: "opencode/deepseek-v4-flash-free",
    label: "DeepSeek V4 Flash",
    vendor: "DeepSeek",
    tag: "FREE · OpenCode",
    agentCapable: true,
    provider: "opencode",
    free: true,
  },
];

/** All free models from all providers. */
export const allFreeModels: ModelInfo[] = [
  ...opencodeFreeMod,
];

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
  },
];

/**
 * Curated default model catalog for DigitalOcean Serverless Inference.
 *
 * The full live list is fetched at runtime from /api/models, which proxies
 * GET https://inference.do-ai.run/v1/models. This static list is shown
 * immediately while the live fetch is in flight (and serves as a fallback
 * if the upstream is down).
 */
export const defaultModels: ModelInfo[] = [
  // ── Free Models ──
  ...allFreeModels,

  // ── OpenAI Codex (requires ChatGPT subscription OAuth) ──
  ...codexModels,

  // ── DigitalOcean Models ──
  {
    id: "deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    vendor: "DeepSeek",
    tag: "1M context · reasoning",
    agentCapable: true,
  },
  {
    id: "deepseek-4-flash",
    label: "DeepSeek 4 Flash",
    vendor: "DeepSeek",
    tag: "Fast reasoning",
    agentCapable: true,
  },
  {
    id: "kimi-k2.6",
    label: "Kimi K2.6",
    vendor: "Kimi",
    tag: "Strong coder",
    agentCapable: true,
  },
  {
    id: "kimi-k2.5",
    label: "Kimi K2.5",
    vendor: "Kimi",
    tag: "MoE · 1T params",
    agentCapable: true,
  },
  {
    id: "glm-5",
    label: "GLM 5",
    vendor: "GLM",
    tag: "Versatile",
  },
];

export const defaultModelId = defaultModels[0].id;

