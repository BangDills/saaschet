import type { ModelInfo } from "./types";

/**
 * Vendors we want to expose in the model selector.
 *
 * Both the curated catalog below AND the live `/api/models` proxy filter
 * against this list, so anything DigitalOcean ships outside of these
 * vendors is hidden from the dropdown.
 */
export const allowedVendors = [
  "Anthropic",
  "OpenAI",
  "DeepSeek",
  "MiniMax",
  "Qwen",
] as const;

export type AllowedVendor = (typeof allowedVendors)[number];

export function isAllowedVendor(v: string): v is AllowedVendor {
  return (allowedVendors as readonly string[]).includes(v);
}

/**
 * Curated default model catalog for DigitalOcean Serverless Inference.
 *
 * The full live list is fetched at runtime from /api/models, which proxies
 * GET https://inference.do-ai.run/v1/models and filters down to the
 * vendors above. This static list is shown immediately while the live
 * fetch is in flight (and serves as a fallback if the upstream is down).
 *
 * IDs follow DigitalOcean's published naming. Update freely as the
 * platform's catalog evolves.
 */
export const defaultModels: ModelInfo[] = [
  // Anthropic
  {
    id: "anthropic-claude-3.5-sonnet",
    label: "Claude 3.5 Sonnet",
    vendor: "Anthropic",
    tag: "Premium · multilingual",
  },
  {
    id: "anthropic-claude-3.5-haiku",
    label: "Claude 3.5 Haiku",
    vendor: "Anthropic",
    tag: "Fast premium",
  },

  // OpenAI
  {
    id: "openai-gpt-4o",
    label: "GPT-4o",
    vendor: "OpenAI",
    tag: "Premium",
  },
  {
    id: "openai-gpt-4o-mini",
    label: "GPT-4o mini",
    vendor: "OpenAI",
    tag: "Fast premium",
  },

  // DeepSeek
  {
    id: "deepseek-r1-distill-llama-70b",
    label: "DeepSeek R1 Distill 70B",
    vendor: "DeepSeek",
    tag: "Reasoning",
  },

  // MiniMax (best-effort id; will be replaced by live list when available)
  {
    id: "minimax-text-01",
    label: "MiniMax Text-01",
    vendor: "MiniMax",
    tag: "Long context",
  },

  // Qwen (best-effort id; live list overrides)
  {
    id: "qwen2.5-72b-instruct",
    label: "Qwen 2.5 72B",
    vendor: "Qwen",
    tag: "Open · multilingual",
  },
];

export const defaultModelId = defaultModels[0].id;
