-- ============================================================================
-- 0029_drop_legacy_github_token.sql — Phase 3 cutover (GitHub App only)
-- ============================================================================
-- Drops the legacy OAuth token column. Repo access now goes exclusively
-- through GitHub App installations (0028_github_app.sql), whose tokens are
-- minted on demand and never stored.
--
-- Only apply AFTER confirming no active user relies on the legacy path
-- (status route previously exposed mode: "legacy" for those users).
-- This is NOT reversible — the tokens are gone for good.
-- ============================================================================

alter table public.profiles drop column if exists github_token;
