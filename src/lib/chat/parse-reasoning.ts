/**
 * Some models (DeepSeek R1, OpenAI o-series, Qwen QwQ, etc.) emit their
 * private reasoning inside `<think>...</think>` tags before the actual
 * answer. We split the message into segments so the UI can:
 *
 *   - render reasoning in a collapsible block
 *   - keep the answer big and readable
 *
 * The parse is deliberately tolerant of streaming, where a chunk may
 * land mid-`<think>` with no closing tag yet.
 */

export type MessageSegment =
  | { type: "text"; content: string }
  | { type: "reasoning"; content: string; closed: boolean };

const OPEN = "<think>";
const CLOSE = "</think>";

export function parseReasoningSegments(input: string): MessageSegment[] {
  if (!input.includes(OPEN)) {
    return input ? [{ type: "text", content: input }] : [];
  }

  const segments: MessageSegment[] = [];
  let cursor = 0;

  while (cursor < input.length) {
    const openIdx = input.indexOf(OPEN, cursor);
    if (openIdx === -1) {
      // No more reasoning blocks — the rest is plain text.
      const rest = input.slice(cursor);
      if (rest) segments.push({ type: "text", content: rest });
      break;
    }

    // Plain text before the opening tag.
    if (openIdx > cursor) {
      segments.push({ type: "text", content: input.slice(cursor, openIdx) });
    }

    const innerStart = openIdx + OPEN.length;
    const closeIdx = input.indexOf(CLOSE, innerStart);

    if (closeIdx === -1) {
      // Streaming: open tag without close yet — everything after is
      // in-progress reasoning.
      segments.push({
        type: "reasoning",
        content: input.slice(innerStart),
        closed: false,
      });
      break;
    }

    segments.push({
      type: "reasoning",
      content: input.slice(innerStart, closeIdx),
      closed: true,
    });
    cursor = closeIdx + CLOSE.length;
  }

  return segments;
}
