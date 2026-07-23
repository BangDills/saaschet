// Types for the chat feature.

export type ChatRole = "user" | "assistant" | "system";

/** A single message persisted in Supabase + sent to the API. */
export type ChatMessage = {
  id: string;
  role: ChatRole;
  /** Plain text content. We send/receive Markdown. */
  content: string;
  /**
   * Full UIMessage parts (text + tool calls + tool results), saved by the
   * client for assistant messages so the action timeline survives reload.
   * Null for legacy rows / user messages (phase 1) — fall back to content.
   */
  parts?: unknown[] | null;
  /**
   * Message metadata — currently { agentState: AgentCompletionState } for
   * assistant messages, so context-aware Quick Actions survive reload.
   * Null for legacy rows / user messages — UI falls back to generic.
   */
  metadata?: unknown | null;
  /** ms since epoch */
  createdAt: number;
};

/**
 * A project folder that groups conversations. Owned by a single user.
 * Shown as a collapsible section in the dashboard sidebar; chats can be
 * filed under a project via Conversation.projectId.
 */
export type Project = {
  id: string;
  name: string;
  /** Optional accent key (e.g. "default", "blue", "amber"). */
  color: string;
  description: string | null;
  createdAt: number;
  updatedAt: number;
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
  /** Pinned conversations are shown before date-based history groups. */
  isPinned: boolean;
  /** Project folder this conversation belongs to, or null. */
  projectId: string | null;
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
  /** Which backend routes this model. Defaults to "fireworks". */
  provider?: "fireworks";
  /** True when this model is free to use. */
  free?: boolean;
  /** True when this model supports multimodal/vision input. */
  multimodal?: boolean;
};
