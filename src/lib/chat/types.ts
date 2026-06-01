// Types for the chat feature.

export type ChatRole = "user" | "assistant" | "system";

/** A single message stored locally and sent to the API. */
export type ChatMessage = {
  id: string;
  role: ChatRole;
  /** Plain text content. We send/receive markdown text. */
  content: string;
  /** ms since epoch */
  createdAt: number;
};

/** A conversation as stored in localStorage. */
export type Conversation = {
  id: string;
  title: string;
  /** model id used most recently in this conversation */
  modelId: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
};

/** A model entry shown in the selector. */
export type ModelInfo = {
  /** id used in API requests, e.g. "llama3.3-70b-instruct" */
  id: string;
  /** human-friendly label */
  label: string;
  /** vendor for badges/grouping */
  vendor: string;
  /** short tagline */
  tag?: string;
};
