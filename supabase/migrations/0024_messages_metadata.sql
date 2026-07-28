-- ============================================================================
-- saaschet — persist message metadata (AgentState) for reload-safe Quick Actions
-- ============================================================================
-- Run this once. The orchestrator emits an AgentCompletionState as message
-- metadata (the 'message-metadata' UIMessage chunk). Without persisting it,
-- reload wipes metadata and the UI falls back to generic Quick Actions even
-- though the assistant message (with its parts/timeline) is still there.
--
-- Add a `metadata` JSONB column to messages. The client saves
-- message.metadata (which contains { agentState }) alongside parts; the
-- history endpoint returns it; toUIMessages restores it onto the UIMessage.
-- Null for legacy rows — UI falls back to generic in that case.
-- ============================================================================

alter table public.messages
  add column if not exists metadata jsonb default null;
