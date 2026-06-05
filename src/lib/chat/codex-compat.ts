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
  const headers = new Headers(init?.headers);
  headers.set("OpenAI-Beta", "responses=v1");
  headers.set("originator", "codex_cli_rs");
  headers.set("Accept", "text/event-stream");
  if (!headers.has("User-Agent")) {
    headers.set("User-Agent", "codex_cli_rs/0.0.0");
  }

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

      // The Codex backend requires instructions as a top-level field. The
      // OpenAI provider serializes system prompts as developer input items.
      const input = Array.isArray(body.input) ? body.input : [];
      if (typeof body.instructions !== "string" || !body.instructions.trim()) {
        const instructionParts: string[] = [];
        const nextInput: unknown[] = [];

        for (const item of input) {
          if (!isInputMessage(item)) {
            nextInput.push(item);
            continue;
          }

          if (item.role === "developer" || item.role === "system") {
            const text = contentToText(item.content);
            if (text) instructionParts.push(text);
          } else {
            nextInput.push(item);
          }
        }

        if (instructionParts.length > 0) {
          body.instructions = instructionParts.join("\n\n");
          body.input = nextInput;
        }
      }

      init = {
        ...init,
        headers,
        body: JSON.stringify(body),
      };
    } catch {
      // Not valid JSON — pass through unmodified
      init = { ...init, headers };
    }
  } else {
    init = { ...init, headers };
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

type InputMessage = {
  role?: unknown;
  content?: unknown;
};

function isInputMessage(value: unknown): value is InputMessage {
  return typeof value === "object" && value !== null && "role" in value;
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content.trim();

  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (typeof part !== "object" || part === null) return "";

      const maybeText = (part as { text?: unknown }).text;
      return typeof maybeText === "string" ? maybeText : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}
