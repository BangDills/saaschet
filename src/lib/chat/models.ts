import type { ModelInfo } from "./types";

/**
 * Vendor display order in the model selector.
 */
export const vendorOrder = [
  "OpenAI",
  "DeepSeek",
  "Nvidia",
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

  // OpenCode free
  "opencode/deepseek-v4-flash-free",

  // Alibaba models
  "glm-5.2",
  "qwen3.7-max",
  "qwen3.7-plus",
  "kimi-k2.7-code",
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
  "glm-5.2",
  "qwen3.7-max",
  "qwen3.7-plus",
]);

/** Check if a model supports vision/multimodal input. */
export function isMultimodal(modelId: string): boolean {
  return multimodalModels.has(modelId);
}

/* ─────────────────────────────────────────────────────────────────────────
 * Multi-provider routing helpers
 *
 * Model IDs use a prefix convention: "provider/model-id".
 * Models without a prefix route to Alibaba (the default provider).
 * ────────────────────────────────────────────────────────────────────── */

type ProviderName = "alibaba" | "opencode" | "codex";

const PROVIDER_PREFIXES: Record<string, ProviderName> = {
  "opencode/": "opencode",
  "codex/": "codex",
};

/** Resolve which provider a model routes through. */
export function resolveProvider(modelId: string): ProviderName {
  for (const [prefix, provider] of Object.entries(PROVIDER_PREFIXES)) {
    if (modelId.startsWith(prefix)) return provider;
  }
  return "alibaba";
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
  alibaba: "https://ws-7i0g4fvbloleocpm.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
  opencode: "https://opencode.ai/zen/v1",
  codex: "https://chatgpt.com/backend-api/codex",
};

/** Environment variable names for each provider's API key. */
export const PROVIDER_ENV_KEYS: Record<ProviderName, string> = {
  alibaba: "ALIBABA_API_KEY",
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
    multimodal: true,
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

  // ── Alibaba Cloud Models ──
  {
    id: "glm-5.2",
    label: "GLM 5.2",
    vendor: "GLM",
    tag: "Latest Multimodal",
    agentCapable: true,
    multimodal: true,
  },
  {
    id: "qwen3.7-max",
    label: "Qwen 3.7 Max",
    vendor: "Qwen",
    tag: "Reasoning Max",
    agentCapable: true,
    multimodal: true,
  },
  {
    id: "qwen3.7-plus",
    label: "Qwen 3.7 Plus",
    vendor: "Qwen",
    tag: "Speed & Quality",
    agentCapable: true,
    multimodal: true,
  },
  {
    id: "kimi-k2.7-code",
    label: "Kimi 2.7 Code",
    vendor: "Kimi",
    tag: "Strong Coder",
    agentCapable: true,
  },
];

export const defaultModelId = defaultModels[0].id;

