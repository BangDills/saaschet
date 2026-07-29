import type { UIMessage, UIMessageChunk } from "ai";

/**
 * Reading and writing the text of a turn: pulling plain text out of UI
 * message parts, the heuristics that decide whether an agent turn stalled,
 * and the one place that injects a synthetic assistant note into a stream.
 */

export function partsToText(parts: UIMessage["parts"] | undefined): string {
  if (!parts) return "";
  return parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .filter(Boolean)
    .join("");
}

export function lastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const text = partsToText(m.parts);
    if (text.trim()) return text;
  }
  return "";
}

export function writeRecoveryNote(
  writer: { write: (part: UIMessageChunk) => void },
  text: string,
) {
  const id = `recovery-${crypto.randomUUID()}`;
  writer.write({ type: "text-start", id });
  writer.write({ type: "text-delta", id, delta: text });
  writer.write({ type: "text-end", id });
}

export function looksLikeActionRequest(text: string): boolean {
  const lower = text.toLowerCase();
  return [
    "buat",
    "bikin",
    "ubah",
    "edit",
    "fix",
    "perbaiki",
    "pasang",
    "tambah",
    "implement",
    "create",
    "build",
    "update",
    "refactor",
    "generate",
    "deploy",
  ].some((word) => lower.includes(word));
}

export function looksLikeStalledAgentText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (trimmed.endsWith(":")) return true;

  const lower = trimmed.toLowerCase();
  return [
    "sekarang saya akan",
    "sekarang buat",
    "akan saya",
    "i will",
    "i'll",
    "next,",
    "now i",
    "let me",
  ].some((phrase) => lower.includes(phrase));
}

export function findExistingWorkBranch(messages: UIMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    const text = partsToText(m.parts);
    const match = text.match(/(celiuz|saaschet)\/\d{4}-\d{2}-\d{2}-[a-z0-9]{6}/i);
    if (match) return match[0];
  }
  return null;
}
