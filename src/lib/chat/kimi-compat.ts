/**
 * Kimi K2.x compatibility layer.
 *
 * Kimi models send `"type":""` instead of `"type":"function"` in streaming
 * tool_call chunks, which breaks the Vercel AI SDK's type validation.
 *
 * This module provides a custom `fetch` wrapper that transparently patches
 * the SSE stream before the AI SDK processes it.
 */

/**
 * Returns true if the model ID belongs to a Kimi model that needs
 * the tool-call type fix.
 */
export function isKimiModel(modelId: string): boolean {
  return /^kimi-/i.test(modelId);
}

/**
 * A drop-in `fetch` replacement that intercepts Kimi SSE responses and
 * fixes `"type":""` → `"type":"function"` on the fly.
 *
 * Usage:
 * ```ts
 * const provider = createOpenAI({
 *   baseURL,
 *   apiKey,
 *   fetch: kimiCompatFetch,
 * });
 * ```
 */
export const kimiCompatFetch: typeof globalThis.fetch = async (
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
      // Fix: Kimi sends "type":"" in tool_calls — patch to "type":"function"
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
