-- ============================================================================
-- 0030_repo_indexing.sql — semantic index over connected GitHub repos
-- ============================================================================
-- Code chunks + embeddings per (user, repo). Tokens are never stored; chunks
-- are derived from repo content the user already granted the App access to.
-- Follows the same 384-dim / HNSW / SECURITY DEFINER pattern as
-- 0015_add_vector_memories.sql + 0020_resize_vector_384.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- repo_indexes: one row per (user, repo) — status + pointer for incremental
-- ----------------------------------------------------------------------------
create table if not exists public.repo_indexes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  repo_full_name  text not null,                    -- "owner/repo"
  default_branch  text not null default 'main',
  head_sha        text,                             -- last indexed commit
  status          text not null default 'pending'
                  check (status in ('pending','indexing','ready','error')),
  file_count      int not null default 0,
  chunk_count     int not null default 0,
  error_message   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint repo_indexes_unique_per_user_repo unique (user_id, repo_full_name)
);

create index if not exists repo_indexes_user_idx
  on public.repo_indexes(user_id);

-- ----------------------------------------------------------------------------
-- code_chunks: file slices + embeddings, scoped to an index (user, repo)
-- ----------------------------------------------------------------------------
create table if not exists public.code_chunks (
  id              uuid primary key default gen_random_uuid(),
  index_id        uuid not null references public.repo_indexes(id) on delete cascade,
  path            text not null,                    -- "src/lib/credits/server.ts"
  chunk_index     int not null,                     -- order within the file
  start_line      int not null,
  end_line        int not null,
  content         text not null,
  embedding       vector(384) not null,
  created_at      timestamptz not null default now(),

  constraint code_chunks_unique unique (index_id, path, chunk_index)
);

create index if not exists code_chunks_index_idx
  on public.code_chunks(index_id);

create index if not exists code_chunks_embedding_idx
  on public.code_chunks using hnsw (embedding vector_cosine_ops);

-- updated_at trigger (reuses touch_updated_at from 0001)
drop trigger if exists repo_indexes_touch on public.repo_indexes;
create trigger repo_indexes_touch
  before update on public.repo_indexes
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.repo_indexes enable row level security;
alter table public.code_chunks  enable row level security;

drop policy if exists "repo_indexes_select_own" on public.repo_indexes;
create policy "repo_indexes_select_own"
  on public.repo_indexes for select
  using (auth.uid() = user_id);

-- Chunks are read via the RPC below (server-side, SECURITY DEFINER but always
-- filtered by p_user_id). This policy is a defense-in-depth fallback.
drop policy if exists "code_chunks_select_own" on public.code_chunks;
create policy "code_chunks_select_own"
  on public.code_chunks for select
  using (
    exists (
      select 1 from public.repo_indexes ri
      where ri.id = code_chunks.index_id and ri.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- RPC: semantic search within one repo owned by the calling user.
-- ----------------------------------------------------------------------------
create or replace function public.match_code_chunks (
  query_embedding vector(384),
  match_threshold float,
  match_count int,
  p_user_id uuid,
  p_repo_full_name text
)
returns table (
  path text,
  start_line int,
  end_line int,
  content text,
  similarity float
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    c.path, c.start_line, c.end_line, c.content,
    (1 - (c.embedding <=> query_embedding))::float as similarity
  from public.code_chunks c
  join public.repo_indexes ri on ri.id = c.index_id
  where ri.user_id = p_user_id
    and ri.repo_full_name = p_repo_full_name
    and (1 - (c.embedding <=> query_embedding)) > match_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
end;
$$;

grant execute on function public.match_code_chunks(vector(384), float, int, uuid, text) to authenticated;
