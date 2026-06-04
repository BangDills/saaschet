// Types for the chat feature.

export type ChatRole = "user" | "assistant" | "system";

/** A single message persisted in Supabase + sent to the API. */
export type ChatMessage = {
  id: string;
  role: ChatRole;
  /** Plain text content. We send/receive Markdown. */
  content: string;
  /** ms since epoch */
  createdAt: number;
};

/** A conversation row, optionally with messages eagerly loaded. */
export type Conversation = {
  id: string;
  title: string;
  /** model id used most recently in this conversation */
  modelId: string;
  /** "owner/repo" connected to this thread, or null */
  githubRepo: string | null;
  /** 'idle' | 'processing' — tracks whether the server is still generating */
  status?: string;
  /** Empty when this object came from the list endpoint. */
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
};

/** Lightweight version returned by /api/conversations (no messages). */
export type ConversationSummary = Omit<Conversation, "messages">;

/** A model entry shown in the selector. */
export type ModelInfo = {
  id: string;
  label: string;
  vendor: string;
  tag?: string;
  /** True when this model reliably supports tool calling for Agent Mode. */
  agentCapable?: boolean;
  /** Which backend routes this model. Defaults to "digitalocean". */
  provider?: "digitalocean" | "opencode";
  /** True when this model is free to use. */
  free?: boolean;
};
