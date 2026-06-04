import type { ModelInfo } from "./types";

/**
 * Vendor display order in the model selector.
 */
export const vendorOrder = [
  "Anthropic",
  "OpenAI",
  "DeepSeek",
  "Google",
  "Meta",
  "Qwen",
  "Kimi",
  "Nvidia",
  "MiniMax",
  "Mistral",
  "GLM",
  "Arcee",
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
  // Anthropic — best-in-class at tool calling & coding
  "anthropic-claude-opus-4.8",
  "anthropic-claude-opus-4.7",
  "anthropic-claude-opus-4.6",
  "anthropic-claude-opus-4.5",
  "anthropic-claude-opus-4",
  "anthropic-claude-4.6-sonnet",
  "anthropic-claude-4.5-sonnet",
  "anthropic-claude-4.1-opus",
  "anthropic-claude-sonnet-4",
  "anthropic-claude-haiku-4.5",

  // OpenAI — excellent tool calling & coding
  "openai-gpt-5.5",
  "openai-gpt-5.4-pro",
  "openai-gpt-5.4",
  "openai-gpt-5.4-mini",
  "openai-gpt-5.3-codex",
  "openai-gpt-5.2-pro",
  "openai-gpt-5.2",
  "openai-gpt-5.1-codex-max",
  "openai-gpt-5",
  "openai-gpt-5-mini",
  "openai-gpt-4.1",
  "openai-gpt-4o",
  "openai-o3",
  "openai-o1",

  // DeepSeek — strong reasoning & coding
  "deepseek-v4-pro",
  "deepseek-4-flash",
  "deepseek-3.2",

  // Qwen — excellent coder models
  "qwen3-coder-flash",
  "qwen3.5-397b-a17b",

  // OpenCode free model
  "opencode/deepseek-v4-flash-free",

  // Kimi — strong coder, tool calling fixed via kimi-compat.ts
  "kimi-k2.6",
  "kimi-k2.5",

  // NOTE: The following models are NOT agent-capable:
  // - Gemma, GLM, Arcee: untested/unreliable tool calling
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

type ProviderName = "digitalocean" | "opencode";

const PROVIDER_PREFIXES: Record<string, ProviderName> = {
  "opencode/": "opencode",
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
};

/** Environment variable names for each provider's API key. */
export const PROVIDER_ENV_KEYS: Record<ProviderName, string> = {
  digitalocean: "DO_INFERENCE_API_KEY",
  opencode: "OPENCODE_API_KEY",
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
 * Curated default model catalog for DigitalOcean Serverless Inference.
 *
 * The full live list is fetched at runtime from /api/models, which proxies
 * GET https://inference.do-ai.run/v1/models. This static list is shown
 * immediately while the live fetch is in flight (and serves as a fallback
 * if the upstream is down).
 */
export const defaultModels: ModelInfo[] = [
  // ── All Free Models (shown first!) ──
  ...allFreeModels,

  // ── DigitalOcean Models ──
  // Anthropic
  {
    id: "anthropic-claude-opus-4.8",
    label: "Claude Opus 4.8",
    vendor: "Anthropic",
    tag: "Best · 1M context",
    agentCapable: true,
  },
  {
    id: "anthropic-claude-4.6-sonnet",
    label: "Claude 4.6 Sonnet",
    vendor: "Anthropic",
    tag: "Fast premium",
    agentCapable: true,
  },
  {
    id: "anthropic-claude-haiku-4.5",
    label: "Claude Haiku 4.5",
    vendor: "Anthropic",
    tag: "Fastest",
    agentCapable: true,
  },

  // OpenAI
  {
    id: "openai-gpt-5.5",
    label: "GPT-5.5",
    vendor: "OpenAI",
    tag: "Flagship · 1M context",
    agentCapable: true,
  },
  {
    id: "openai-gpt-5.4-pro",
    label: "GPT-5.4 Pro",
    vendor: "OpenAI",
    tag: "Premium · 1M context",
    agentCapable: true,
  },
  {
    id: "openai-gpt-5.3-codex",
    label: "GPT-5.3 Codex",
    vendor: "OpenAI",
    tag: "Best coder",
    agentCapable: true,
  },
  {
    id: "openai-gpt-5.4-mini",
    label: "GPT-5.4 Mini",
    vendor: "OpenAI",
    tag: "Fast & cheap",
    agentCapable: true,
  },

  // DeepSeek
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

  // Qwen
  {
    id: "qwen3-coder-flash",
    label: "Qwen3 Coder Flash",
    vendor: "Qwen",
    tag: "Fast coder",
    agentCapable: true,
  },
  {
    id: "qwen3.5-397b-a17b",
    label: "Qwen 3.5 397B",
    vendor: "Qwen",
    tag: "Large MoE",
    agentCapable: true,
  },
];

export const defaultModelId = defaultModels[0].id;

