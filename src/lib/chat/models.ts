import type { ModelInfo } from "./types";

/**
 * Curated default model catalog for DigitalOcean Serverless Inference.
 *
 * The full live list can be fetched at runtime from /api/models, which proxies
 * GET https://inference.do-ai.run/v1/models. This static list is used as the
 * initial catalog and as a fallback if the live API is unreachable.
 *
 * Model IDs follow DigitalOcean's published naming. Adjust freely as new
 * models become available.
 */
export const defaultModels: ModelInfo[] = [
  {
    id: "llama3.3-70b-instruct",
    label: "Llama 3.3 70B",
    vendor: "Meta",
    tag: "Open · fast",
  },
  {
    id: "deepseek-r1-distill-llama-70b",
    label: "DeepSeek R1 Distill 70B",
    vendor: "DeepSeek",
    tag: "Reasoning",
  },
  {
    id: "mistral-nemo-instruct-2407",
    label: "Mistral Nemo",
    vendor: "Mistral",
    tag: "Open · balanced",
  },
  {
    id: "anthropic-claude-3.5-sonnet",
    label: "Claude 3.5 Sonnet",
    vendor: "Anthropic",
    tag: "Premium",
  },
  {
    id: "anthropic-claude-3.5-haiku",
    label: "Claude 3.5 Haiku",
    vendor: "Anthropic",
    tag: "Fast premium",
  },
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
];

export const defaultModelId = defaultModels[0].id;
