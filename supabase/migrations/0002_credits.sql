-- ============================================================================
-- Horizon AI / saaschet — credits ledger (Phase 4A, no payment yet)
-- ============================================================================
-- Run this once in your Supabase project's SQL Editor AFTER 0001_initial.
--
-- Tables:
--   public.user_credits      — one row per user, current balance + daily limit
--   public.credit_usage_log  — append-only ledger of every spend
--
-- The ledger lets us build "today's usage" charts later without losing detail
-- when the daily counter resets.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- user_credits
-- ----------------------------------------------------------------------------
create table if not exists public.user_credits (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  -- "Vibe units" budget per UTC day. Adjustable per-user later if we add tiers.
  daily_limit      integer not null default 50,
  -- Credits spent in the current day window. Reset lazily on read.
  used_today       integer not null default 0,
  -- Day window the counter is for, stored as a UTC date.
  day_started_on   date    not null default (now() at time zone 'utc')::date,
  -- Lifetime total (never resets). Useful for analytics + dashboard.
  total_used       bigint  not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- credit_usage_log — append-only event stream
-- ----------------------------------------------------------------------------
create table if not exists public.credit_usage_log (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  conversation_id  uuid references public.conversations(id) on delete set null,
  -- 'chat' (one-shot reply) | 'agent' (multi-step tool loop)
  kind             text not null check (kind in ('chat', 'agent')),
  -- Total credits charged for this turn.
  cost             integer not null check (cost >= 0),
  -- Model + tool count for analytics.
  model_id         text,
  tool_count       integer not null default 0,
  created_at       timestamptz not null default now()
);

create index if not exists credit_usage_log_user_created_idx
  on public.credit_usage_log(user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- updated_at trigger
-- ----------------------------------------------------------------------------
drop trigger if exists user_credits_touch_updated_at on public.user_credits;
create trigger user_credits_touch_updated_at
  before update on public.user_credits
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Auto-create a user_credits row whenever a new auth.users entry appears.
-- We do this by hooking the same handle_new_user function from migration 1
-- via a separate trigger so the original profile flow keeps working even if
-- this migration is run later.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user_credits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_credits (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_credits on auth.users;
create trigger on_auth_user_created_credits
  after insert on auth.users
  for each row execute function public.handle_new_user_credits();

-- Backfill existing users so they have a credits row right away.
insert into public.user_credits (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.user_credits     enable row level security;
alter table public.credit_usage_log enable row level security;

-- user_credits: each user can only see their own balance.
drop policy if exists "user_credits_select_own" on public.user_credits;
create policy "user_credits_select_own"
  on public.user_credits for select
  using (auth.uid() = user_id);

-- We deliberately do NOT add update / insert policies for clients. Only the
-- server (using the service-role key, or via RPC functions running with
-- security definer) is allowed to write. This stops a curious user from
-- topping themselves up via the anon key.

-- credit_usage_log: each user can only see their own events.
drop policy if exists "credit_usage_log_select_own" on public.credit_usage_log;
create policy "credit_usage_log_select_own"
  on public.credit_usage_log for select
  using (auth.uid() = user_id);
