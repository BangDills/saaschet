-- Migration: Add vector memory tables and semantic search helpers
-- Enable pgvector extension (standard Supabase vector extension)
CREATE EXTENSION IF NOT EXISTS vector;

-- Table to store user memories/preferences semantically
CREATE TABLE IF NOT EXISTS public.user_memories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     text NOT NULL,
  -- 1024 is the dimension for DigitalOcean embedding models (bge-large-en-v1.5, gte-large)
  embedding   vector(1024) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for semantic search to speed up queries (using HNSW or IVFFlat)
-- HNSW is preferred for general vector queries
CREATE INDEX IF NOT EXISTS user_memories_embedding_idx
  ON public.user_memories USING hnsw (embedding vector_cosine_ops);

-- Index on user_id to quickly filter memories for a specific user
CREATE INDEX IF NOT EXISTS user_memories_user_id_idx
  ON public.user_memories(user_id);

-- Row Level Security (RLS)
ALTER TABLE public.user_memories ENABLE ROW LEVEL SECURITY;

-- Select policy: users can only see their own memories
CREATE POLICY "user_memories_select_own"
  ON public.user_memories FOR SELECT
  USING (auth.uid() = user_id);

-- Insert/Update/Delete policy: Server-side only (bypasses RLS using service_role key / RPC)
-- This matches the design of user_credits. Clients should not write vectors directly.

-- Trigger for updating the updated_at timestamp
CREATE TRIGGER user_memories_touch_updated_at
  BEFORE UPDATE ON public.user_memories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Semantic similarity search function using cosine distance
-- Query via RPC from Supabase JS client
CREATE OR REPLACE FUNCTION public.match_memories (
  query_embedding vector(1024),
  match_threshold float,
  match_count int,
  p_user_id uuid
)
RETURNS TABLE (
  id uuid,
  content text,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with privileges of creator to bypass RLS restrictions safely
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.content,
    (1 - (m.embedding <=> query_embedding))::float AS similarity
  FROM public.user_memories m
  WHERE m.user_id = p_user_id
    AND (1 - (m.embedding <=> query_embedding)) > match_threshold
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant execute permissions to authenticated users (internally gates on auth.uid() or parameter checks)
GRANT EXECUTE ON FUNCTION public.match_memories(vector(1024), float, int, uuid) TO authenticated;
