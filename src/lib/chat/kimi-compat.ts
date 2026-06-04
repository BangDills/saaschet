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
  return /^kimi-/i.test(modelId) || /^glm-/i.test(modelId);
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
export const toolCallCompatFetch: typeof globalThis.fetch = async (
  input,
  init,
) => {
  const response = await globalThis.fetch(input, init);

  // Only patch streaming (SSE) responses — leave non-streaming untouched.
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.body || !contentType.includes("text/event-stream")) {
    return response;
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const text = decoder.decode(chunk, { stream: true });
      // Fix: model sends "type":"" in tool_calls — patch to "type":"function"
      const fixed = text.replace(/"type":""/g, '"type":"function"');
      controller.enqueue(encoder.encode(fixed));
    },
    flush(controller) {
      // Flush any remaining bytes from the decoder
      const remaining = decoder.decode();
      if (remaining) {
        const fixed = remaining.replace(/"type":""/g, '"type":"function"');
        controller.enqueue(encoder.encode(fixed));
      }
    },
  });

  return new Response(response.body.pipeThrough(transform), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
};

// Keep old name as alias.
export const kimiCompatFetch = toolCallCompatFetch;
