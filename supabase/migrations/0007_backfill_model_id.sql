-- ============================================================================
-- saaschet — backfill conversation model_id after Fireworks provider switch
-- ============================================================================
-- Run this once after the model rework (0006_atomic_credits.sql or later).
--
-- Why: conversations created before the switch store model_id from removed
-- providers (Alibaba: glm-5.2, qwen3.7-max, qwen3.7-plus, kimi-k2.7-code;
-- OpenCode: opencode/deepseek-v4-flash-free). The /api/chat route now
-- validates model_id against the catalog and falls back to the default, so
-- stale ids won't 404 — but they'd still show a stale label in the UI until
-- the user picks a new model. This migration rewrites stale ids to the new
-- default so old conversations resume cleanly.
--
-- New default: accounts/fireworks/models/glm-5p2
-- ============================================================================

update public.conversations
   set model_id = 'accounts/fireworks/models/glm-5p2',
       updated_at = now()
 where model_id in (
        'glm-5.2',
        'qwen3.7-max',
        'qwen3.7-plus',
        'kimi-k2.7-code',
        'opencode/deepseek-v4-flash-free'
      );

-- Optional: report how many rows were rewritten for sanity.
-- (Re-run safely; the WHERE no longer matches after the first run.)
