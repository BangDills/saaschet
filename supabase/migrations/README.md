# Database migrations

Migrations here are applied **by hand**, in filename order, via the Supabase
Dashboard → SQL Editor. There is no `supabase/config.toml`, no CLI project and
no runner, so nothing tracks which migrations a database has already seen —
the file order below *is* the source of truth.

## Rules

1. **Apply in filename order.** `ls` order = apply order. Never skip a file.
2. **New migrations get the next number** (`0027_`, `0028_`, …). Do not use
   date-based names; mixing the two schemes is what caused the incident
   described below.
3. **A later migration must never silently undo an earlier one.** If you
   recreate a function, copy the *current* definition from the newest
   migration that touched it, not from the one that created it.
4. Prefer idempotent statements (`if not exists`, `create or replace`,
   `drop ... if exists`) so a re-run is harmless.

## Why the numbering was redone

Files used to be split across two schemes: `0001`–`0018` and `20260605`–
`20260623`. Sorted lexicographically, every `00NN` file came before every
`2026NNNN` file — which put migrations in an order that does not work:

- `0011_drop_openai_token_columns` sorted *before*
  `20260605_add_openai_tokens`, so a fresh database dropped the columns and
  then recreated them. The migration's own comment says its purpose is to
  "avoid storing stale secrets" — it achieved the opposite.
- `0010_lock_match_memories` sorted *before*
  `20260621_add_vector_memories`, which creates the very function `0010`
  hardens. On a fresh database the security gate was applied first and then
  overwritten by `20260621`, and again by `20260623_resize_vector_384` —
  leaving `match_memories` reachable by any authenticated user with no
  ownership check (see `0026`).

Production was never affected: migrations there were applied following the
`Run this once after …` headers, not `ls` order. The hazard was to any *new*
database — staging, a restore, or a move to another Supabase project.

Everything is now one sequence in true dependency order.

## Old → new names

| Old | New |
|---|---|
| `0001_initial_schema` | `0001_initial_schema` |
| `0002_credits` | `0002_credits` |
| `0002_message_feedback` | `0003_message_feedback` |
| `0003_conversation_pinning` | `0004_conversation_pinning` |
| `0003_tiers` | `0005_tiers` |
| `0004_roles` | `0006_roles` |
| `0005_conversation_status` | `0007_conversation_status` |
| `0006_atomic_credits` | `0008_atomic_credits` |
| `0007_backfill_model_id` | `0009_backfill_model_id` |
| `0008_pro_trial_24h` | `0010_pro_trial_24h` |
| `0009_lock_role_column` | `0011_lock_role_column` |
| `20260605_add_openai_tokens` | `0012_add_openai_tokens` |
| `20260611_add_image_credit_kind` | `0013_add_image_credit_kind` |
| `0011_drop_openai_token_columns` | `0014_drop_openai_token_columns` |
| `20260621_add_vector_memories` | `0015_add_vector_memories` |
| `0010_lock_match_memories` | `0016_lock_match_memories` |
| `0012_fix_spend_credits_ambiguous` | `0017_fix_spend_credits_ambiguous` |
| `0013_fix_spend_credits_conflict` | `0018_fix_spend_credits_conflict` |
| `20260622_add_profile_structured_memory` | `0019_add_profile_structured_memory` |
| `20260623_resize_vector_384` | `0020_resize_vector_384` |
| `0014_messages_parts` | `0021_messages_parts` |
| `0015_messages_client_id` | `0022_messages_client_id` |
| `0016_messages_client_id_full_unique` | `0023_messages_client_id_full_unique` |
| `0017_messages_metadata` | `0024_messages_metadata` |
| `0018_projects` | `0025_projects` |
| `20260728_relock_match_memories_384` | `0026_relock_match_memories_384` |

Only the names changed — no SQL was rewritten, apart from updating the
`Run this once after …` cross-references inside the headers.

## Ordering constraints worth knowing

These pairs must keep their relative order; the rest is chronological.

| Must run first | Then | Why |
|---|---|---|
| `0002_credits` | `0005_tiers`, `0008_atomic_credits`, `0013_add_image_credit_kind` | they extend `user_credits` / `credit_usage_log` |
| `0012_add_openai_tokens` | `0014_drop_openai_token_columns` | the drop cleans up what the add created |
| `0015_add_vector_memories` | `0016_lock_match_memories` | `0016` hardens the function `0015` creates |
| `0020_resize_vector_384` | `0026_relock_match_memories_384` | `0020` recreates `match_memories` without the gate; `0026` restores it |

`0026` is deliberately last: whatever order the vector migrations ran in, the
ownership gate on `match_memories` gets the final word.

## Applying to a fresh database

Paste each file into the SQL Editor in order, `0001` → `0027`. Note that the
editor only shows the result of the **last** statement when you run several at
once — run one file at a time.

Afterwards, verify the security-sensitive state:

```sql
-- match_memories must carry the ownership gate
select case
  when pg_get_functiondef(p.oid) ilike '%auth.uid()%' then 'gated (ok)'
  else 'UNGATED — apply 0026'
end as match_memories_status
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'match_memories';

-- embedding column must match the app (384 dims, see src/lib/chat/jina-embeddings.ts)
select format_type(atttypid, atttypmod) as embedding_type
from pg_attribute
where attrelid = 'public.user_memories'::regclass and attname = 'embedding';

-- the OpenAI/Codex token columns must NOT exist (0014 drops them)
select count(*) as leftover_openai_columns
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('openai_access_token', 'openai_refresh_token', 'openai_token_expires');
```

Expected: `gated (ok)`, `vector(384)`, `0`.
