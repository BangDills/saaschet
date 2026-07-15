-- ============================================================================
-- saaschet — gate match_memories RPC on the caller's own user_id
-- ============================================================================
-- Run this once after 20260621_add_vector_memories.sql.
--
-- Why: match_memories is SECURITY DEFINER (bypasses RLS) and filters
-- `WHERE m.user_id = p_user_id`, but never checks that p_user_id is the
-- caller. An authenticated user could pass another user's id and read
-- their stored memories (facts, preferences). Add an ownership check.
-- ============================================================================

create or replace function public.match_memories (
  query_embedding vector(1024),
  match_threshold float,
  match_count int,
  p_user_id uuid
)
returns table (
  id uuid,
  content text,
  similarity float
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'Not authorized: can only query your own memories';
  end if;

  return query
  select
    m.id,
    m.content,
    (1 - (m.embedding <=> query_embedding))::float as similarity
  from public.user_memories m
  where m.user_id = p_user_id
    and (1 - (m.embedding <=> query_embedding)) > match_threshold
  order by m.embedding <=> query_embedding
  limit match_count;
end;
$$;

grant execute on function public.match_memories(vector(1024), float, int, uuid) to authenticated;

-- ============================================================================
-- Revoke client access to server-only credit/tier RPCs.
-- ============================================================================
-- spend_credits and set_user_tier_by_admin are SECURITY DEFINER and take a
-- target user_id parameter with no auth.uid() gate (service role has no
-- auth.uid). They were granted to authenticated/anon "for completeness",
-- which means an authenticated user could call them directly with another
-- user's id — corrupting credits or granting Pro. They are only ever called
-- from the server via the service-role admin client, which bypasses grants.
-- Revoke client access entirely.

revoke execute on function public.spend_credits(
  uuid, text, integer, text, uuid, integer
) from authenticated, anon;

revoke execute on function public.set_user_tier_by_admin(
  uuid, text
) from authenticated, anon;

