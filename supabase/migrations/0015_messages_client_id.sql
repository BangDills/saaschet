-- ============================================================================
-- saaschet — idempotent assistant message save (client_message_id)
-- ============================================================================
-- Run this once. Pairs with the client flow fix that stops saving on reload.
--
-- Why: after the parts-persistence change, every reload re-saved the last
-- assistant message (client effect fired on hydration with status "ready"),
-- producing duplicate rows. The client now only saves after a real stream,
-- but the endpoint must also be idempotent against retries/reconnects/races.
--
-- Add a client-provided message id (the UIMessage id) and a unique key on
-- (conversation_id, client_message_id) so a repeated request for the same
-- client message updates the existing row instead of inserting a new one.
-- ON CONFLICT DO UPDATE keeps the parts/content fresh on retry (e.g. when
-- a later retry carries more complete parts).
-- ============================================================================

alter table public.messages
  add column if not exists client_message_id text;

-- One client message id per conversation. Null for legacy / server-inserted
-- rows (user messages phase 1) — the partial index lets multiple nulls coexist.
create unique index if not exists messages_conversation_client_id_uniq
  on public.messages (conversation_id, client_message_id)
  where client_message_id is not null;
