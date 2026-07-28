-- Add OpenAI Codex OAuth token columns to profiles.
-- These store the user's ChatGPT subscription OAuth tokens
-- obtained via the Device Code flow.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS openai_access_token  TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS openai_refresh_token TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS openai_token_expires TIMESTAMPTZ DEFAULT NULL;

-- RLS: Users can read their own OpenAI tokens.
-- The admin client (service_role) is used for writes.
COMMENT ON COLUMN profiles.openai_access_token IS 'OpenAI ChatGPT OAuth access token (Codex Device Code flow)';
COMMENT ON COLUMN profiles.openai_refresh_token IS 'OpenAI ChatGPT OAuth refresh token';
COMMENT ON COLUMN profiles.openai_token_expires IS 'Access token expiry timestamp';
