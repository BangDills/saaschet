-- ============================================================================
-- saaschet — store assistant message parts (tool calls/actions) for reload
-- ============================================================================
-- Run this once. Phase 1: assistant messages only.
--
-- Why: assistant messages were persisted as `content: text` only (partsToText
-- strips tool-call parts). So the "Completed · N actions" timeline (Ran
-- command, Read file, …) lived only in client state and vanished on reload.
-- Add a `parts` JSONB column holding the full UIMessage parts array (text +
-- tool calls + tool results) so the timeline can be restored on reload.
--
-- Phase 2 (later): persist user message parts too (image/file attachments).
--
-- Backward compat: old rows have parts = NULL → client falls back to
-- [{ type: "text", text: content }].
-- ============================================================================

alter table public.messages
  add column if not exists parts jsonb default null;
