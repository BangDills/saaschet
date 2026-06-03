-- ============================================================================
-- Add status column to conversations for background processing tracking
-- ============================================================================
-- Tracks whether the AI agent is still working on a conversation.
-- 'idle' = no active processing, 'processing' = server is generating a response.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'idle'
  CHECK (status IN ('idle', 'processing'));
