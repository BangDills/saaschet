-- Migration: Resize vector embedding column from 1024 to 384 dimensions
-- Required because we switched from DigitalOcean bge-large-en-v1.5 (1024d)
-- to local Supabase/gte-small via Transformers.js (384d).
--
-- WARNING: Existing 1024-dim embeddings are incompatible with the new model
-- and will be dropped. This is expected — they were from a different model.

-- 1. Drop objects that depend on the old vector(1024) signature
DROP FUNCTION IF EXISTS public.match_memories(vector(1024), float, int, uuid);
DROP INDEX IF EXISTS user_memories_embedding_idx;

-- 2. Replace the embedding column (drop + re-add with new dimension)
ALTER TABLE public.user_memories DROP COLUMN IF EXISTS embedding;
ALTER TABLE public.user_memories
  ADD COLUMN embedding vector(384) NOT NULL DEFAULT array_fill(0, ARRAY[384])::vector;
ALTER TABLE public.user_memories
  ALTER COLUMN embedding DROP DEFAULT;

-- 3. Recreate HNSW index for fast cosine similarity search
CREATE INDEX user_memories_embedding_idx
  ON public.user_memories USING hnsw (embedding vector_cosine_ops);

-- 4. Recreate the semantic search RPC function with 384-dim signature
CREATE OR REPLACE FUNCTION public.match_memories (
  query_embedding vector(384),
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
SECURITY DEFINER
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

GRANT EXECUTE ON FUNCTION public.match_memories(vector(384), float, int, uuid) TO authenticated;
