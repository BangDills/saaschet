// UUID generator that works in older browsers + Node.

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Generate a short title for a conversation from its first user message.
 * Used both client-side (optimistic) and server-side (when creating the
 * conversation row).
 */
export function deriveTitle(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) return "New chat";
  if (trimmed.length <= 48) return trimmed;
  return trimmed.slice(0, 45) + "…";
}
