-- ============================================================================
-- saaschet — drop ChatGPT/Codex OAuth token columns
-- ============================================================================
-- Run this once. The Codex provider (ChatGPT OAuth device-code flow) was
-- removed from the app; the columns that stored per-user OpenAI tokens are
-- now dead. Drop them to avoid storing stale secrets.
-- ============================================================================

alter table public.profiles
  drop column if exists openai_access_token,
  drop column if exists openai_refresh_token,
  drop column if exists openai_token_expires;
