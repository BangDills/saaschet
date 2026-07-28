-- ============================================================================
-- saaschet — restore the ownership gate on match_memories (384-dim)
-- ============================================================================
-- Run this once, after 20260623_resize_vector_384.sql.
--
-- REGRESSION BEING FIXED
-- 0010_lock_match_memories.sql added an ownership check to match_memories,
-- because the function is SECURITY DEFINER (bypasses RLS) and filters on
-- `p_user_id` — a parameter supplied by the CALLER. Without the check, any
-- authenticated user could pass someone else's uuid and read their stored
-- memories (extracted personal facts, preferences, project details).
--
-- 20260623_resize_vector_384.sql later dropped the vector(1024) function and
-- recreated it at vector(384) to match the new embedding model — but rebuilt
-- it from the ORIGINAL body, without 0010's ownership check, and re-granted
-- EXECUTE to `authenticated`. The fix was silently undone: the live 384-dim
-- function reachable over PostgREST (/rest/v1/rpc/match_memories) is ungated.
--
-- This migration restores the check on the 384-dim signature.
--
-- Server-side callers are unaffected: memory search runs through the
-- service-role admin client, which has no auth.uid(), so the gate is skipped
-- exactly as 0010 intended.
-- ============================================================================

-- The vector(1024) overload cannot work against the resized vector(384)
-- column. Drop it if a database ended up with both (e.g. migrations applied
-- out of order) so only the gated 384-dim function remains.
drop function if exists public.match_memories(vector(1024), float, int, uuid);

create or replace function public.match_memories (
  query_embedding vector(384),
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
  -- Client callers must query their own memories. The service role (server,
  -- used for memory extraction/search) has no auth.uid() and bypasses this.
  if auth.uid() is not null and p_user_id is distinct from auth.uid() then
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

grant execute on function public.match_memories(vector(384), float, int, uuid) to authenticated;
