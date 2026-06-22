/**
 * Tool-call type compatibility layer for Kimi K2.x and GLM-5.
 *
 * These models send `"type":""` instead of `"type":"function"` in streaming
 * tool_call chunks, which breaks the Vercel AI SDK's type validation.
 *
 * This module provides a custom `fetch` wrapper that transparently patches
 * the SSE stream before the AI SDK processes it.
 */

/**
 * Returns true if the model ID belongs to a model that sends
 * `"type":""` in tool_call streaming chunks and needs the fix.
 *
 * Known affected models:
 * - Kimi K2.x (kimi-k2.5, kimi-k2.6)
 * - GLM-5
 */
export function needsToolCallTypeFix(modelId: string): boolean {
  return /^kimi-/i.test(modelId) || /^glm-/i.test(modelId) || /deepseek/i.test(modelId);
}

// Keep the old name as an alias for backward compatibility.
export const isKimiModel = needsToolCallTypeFix;

/**
 * A drop-in `fetch` replacement that intercepts SSE responses and
 * fixes `"type":""` → `"type":"function"` on the fly.
 *
 * Usage:
 * ```ts
 * const provider = createOpenAI({
 *   baseURL,
 *   apiKey,
 *   fetch: toolCallCompatFetch,
 * });
 * ```
 */
export const toolCallCompatFetch: typeof globalThis.fetch = globalThis.fetch;

// Keep old name as alias.
export const kimiCompatFetch = toolCallCompatFetch;
