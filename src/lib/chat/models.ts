import type { ModelInfo } from "./types";

/**
 * All vendor labels we know how to detect from DigitalOcean model IDs.
 * Used for sorting — vendor order in this array determines display order.
 */
export const vendorOrder = [
  "Anthropic",
  "OpenAI",
  "Google",
  "DeepSeek",
  "Meta",
  "Mistral",
  "Qwen",
  "MiniMax",
] as const;

/**
 * Curated default model catalog for DigitalOcean Serverless Inference.
 *
 * The full live list is fetched at runtime from /api/models, which proxies
 * GET https://inference.do-ai.run/v1/models. This static list is shown
 * immediately while the live fetch is in flight (and serves as a fallback
 * if the upstream is down).
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

  // MiniMax
  {
    id: "minimax-text-01",
    label: "MiniMax Text-01",
    vendor: "MiniMax",
    tag: "Long context",
  },

  // Qwen
  {
    id: "qwen2.5-72b-instruct",
    label: "Qwen 2.5 72B",
    vendor: "Qwen",
    tag: "Open · multilingual",
  },
];

export const defaultModelId = defaultModels[0].id;
