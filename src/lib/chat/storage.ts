"use client";

import type { Conversation, ChatMessage } from "./types";

const STORAGE_KEY = "saaschet:chat:conversations:v1";

function safeReadAll(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Conversation[]) : [];
  } catch {
    return [];
  }
}

function safeWriteAll(items: Conversation[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore quota / serialization errors
  }
}

export function listConversations(): Conversation[] {
  // newest first
  return safeReadAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getConversation(id: string): Conversation | undefined {
  return safeReadAll().find((c) => c.id === id);
}

export function saveConversation(conv: Conversation) {
  const items = safeReadAll();
  const idx = items.findIndex((c) => c.id === conv.id);
  if (idx === -1) items.push(conv);
  else items[idx] = conv;
  safeWriteAll(items);
}

export function deleteConversation(id: string) {
  const items = safeReadAll().filter((c) => c.id !== id);
  safeWriteAll(items);
}

export function clearAllConversations() {
  safeWriteAll([]);
}

/**
 * Generate a short title for a conversation from its first user message.
 */
export function deriveTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "New chat";
  const text = firstUser.content.trim().replace(/\s+/g, " ");
  if (text.length <= 48) return text || "New chat";
  return text.slice(0, 45) + "…";
}

/** UUID-ish id generator that works in older browsers too. */
export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
