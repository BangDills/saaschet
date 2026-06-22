-- Migration: Add structured_memory JSONB column to public.profiles table
-- This column will store structured, key-value metadata about the user's preferences, frameworks, languages, etc.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS structured_memory jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Create an index to support fast JSONB containment/queries if needed
CREATE INDEX IF NOT EXISTS profiles_structured_memory_idx ON public.profiles USING gin (structured_memory);
