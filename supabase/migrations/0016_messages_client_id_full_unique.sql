-- ============================================================================
-- saaschet — full unique constraint for ON CONFLICT idempotent upsert
-- ============================================================================
-- Run this once after 0015. 0015 created a PARTIAL unique index
-- (where client_message_id is not null), but Postgres ON CONFLICT can't
-- target a partial index unless the statement carries the same predicate —
-- and Supabase's onConflict option doesn't support predicates. The upsert
-- errored 42P10 ("no unique or exclusion constraint matching the ON
-- CONFLICT specification").
--
-- Replace the partial index with a regular UNIQUE constraint on
-- (conversation_id, client_message_id). Postgres unique constraints allow
-- multiple NULLs in client_message_id (legacy / user messages), so this is
-- safe and is a valid ON CONFLICT target for
--   ON CONFLICT (conversation_id, client_message_id) DO UPDATE.
-- ============================================================================

drop index if exists messages_conversation_client_id_uniq;

alter table public.messages
  drop constraint if exists messages_conversation_client_id_uniq;

alter table public.messages
  add constraint messages_conversation_client_id_uniq
  unique (conversation_id, client_message_id);
