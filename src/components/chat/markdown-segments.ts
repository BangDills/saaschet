/**
 * Split markdown into independently renderable segments at top-level heading
 * lines, without splitting inside fenced code blocks.
 *
 * Used while a document streams in: only the trailing segment changes between
 * flushes, so every earlier segment keeps its memoized ReactMarkdown tree
 * instead of the whole growing document being re-parsed on each chunk. On a
 * phone that is the difference between a frozen page and a smooth one.
 *
 * Headings are always top-level block boundaries — no markdown construct
 * (table, list, blockquote) spans across one — so joining the segments back
 * with "\n" reproduces the input exactly and the rendered output is
 * identical to a single-pass render.
 */
export function splitStreamingSegments(content: string): string[] {
  const lines = content.split("\n");
  const segments: string[] = [];
  let current: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    else if (!inFence && /^#{1,6}\s/.test(line) && current.length > 0) {
      segments.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) segments.push(current.join("\n"));
  return segments;
}
