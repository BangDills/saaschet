/**
 * Custom fetch wrapper for the OpenAI Codex backend (chatgpt.com/backend-api/codex).
 *
 * The Codex backend has strict requirements that differ from the standard
 * OpenAI API. This wrapper intercepts the request and patches the body to
 * comply with what the Codex backend expects:
 *
 * - `store: false` (required — Codex backend does not support stored responses)
 * - `max_output_tokens` removed (Codex backend rejects this parameter)
 * - `reasoning` config added (enables chain-of-thought with summary)
 *
 * Based on hermes-agent's ResponsesApiTransport (agent/transports/codex.py).
 */
export async function codexCompatFetch(
  url: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (init?.body && typeof init.body === "string") {
    try {
      const body = JSON.parse(init.body) as Record<string, unknown>;

      // 1. Required: store must be false
      body.store = false;

      // 2. Remove max_output_tokens — Codex backend rejects it
      delete body.max_output_tokens;

      // 3. Add reasoning config if not present
      if (!body.reasoning) {
        body.reasoning = { effort: "medium", summary: "auto" };
      }

      // 4. Request encrypted reasoning content for chain continuity
      const include = Array.isArray(body.include) ? body.include : [];
      body.include = include.includes("reasoning.encrypted_content")
        ? include
        : [...include, "reasoning.encrypted_content"];

      init = {
        ...init,
        body: JSON.stringify(body),
      };
    } catch {
      // Not valid JSON — pass through unmodified
    }
  }

  const res = await fetch(url, init);

  // Log non-OK responses for debugging
  if (!res.ok) {
    const cloned = res.clone();
    try {
      const errText = await cloned.text();
      console.error(
        `[codex-compat] ${res.status} ${res.statusText}:`,
        errText.slice(0, 500),
      );
    } catch {
      // ignore
    }
  }

  return res;
}
