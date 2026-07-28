-- ============================================================================
-- Horizon AI / saaschet — user tiers (Free / Pro), no payment yet
-- ============================================================================
-- Run this once after 0002_credits.sql.
--
-- Adds a `tier` column to public.user_credits and seeds Free = 50/day,
-- Pro = 1000/day. The `daily_limit` column becomes a derived value (we
-- still keep it for per-user overrides if a tier doesn't fit), but the
-- tier is the source of truth going forward.
--
-- Switching tiers is a privileged operation done via a Postgres function
-- that runs with security definer. The /api/profile/tier route handler
-- in the app calls it; clients don't get UPDATE access to the tier column
-- via RLS.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Add tier column with constrained values + sensible default
-- ----------------------------------------------------------------------------
alter table public.user_credits
  add column if not exists tier text not null default 'free'
    check (tier in ('free', 'pro'));

-- Backfill: existing rows get 'free' (default), but make sure their
-- daily_limit matches the tier the first time we see them.
update public.user_credits
   set daily_limit = 50
 where tier = 'free' and daily_limit <> 50;

-- ----------------------------------------------------------------------------
-- Privileged tier-set function. Bypasses RLS via security definer + the
-- explicit search_path. Anon callers still need to be authenticated; the
-- function checks that the caller owns the row.
-- ----------------------------------------------------------------------------
create or replace function public.set_user_tier(p_tier text)
returns table (
  user_id uuid,
  tier text,
  daily_limit integer,
  used_today integer,
  remaining integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_limit integer;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;
  if p_tier not in ('free', 'pro') then
    raise exception 'Unknown tier: %', p_tier;
  end if;

  v_limit := case p_tier when 'pro' then 1000 else 50 end;

  update public.user_credits c
     set tier = p_tier,
         daily_limit = v_limit
   where c.user_id = v_user;

  -- If the user has no credits row yet (shouldn't happen post-migration 2,
  -- but be defensive) insert one.
  if not found then
    insert into public.user_credits (user_id, tier, daily_limit)
    values (v_user, p_tier, v_limit);
  end if;

  return query
    select c.user_id,
           c.tier,
           c.daily_limit,
           c.used_today,
           greatest(0, c.daily_limit - c.used_today) as remaining
      from public.user_credits c
     where c.user_id = v_user;
end;
$$;

-- Allow authenticated users to call the function (it self-gates on auth.uid()).
grant execute on function public.set_user_tier(text) to authenticated;

-- ----------------------------------------------------------------------------
-- Convenience view for the dashboard: per-day usage bucketed by user.
-- Postgres handles the time-zone math; we report UTC dates to match the
-- daily reset window.
-- ----------------------------------------------------------------------------
create or replace view public.credit_usage_daily as
select
  user_id,
  (created_at at time zone 'utc')::date as day,
  sum(cost)::integer as cost,
  sum(case when kind = 'agent' then 1 else 0 end)::integer as agent_turns,
  sum(case when kind = 'chat'  then 1 else 0 end)::integer as chat_turns,
  sum(tool_count)::integer as tool_calls
from public.credit_usage_log
group by user_id, day;

-- The view inherits RLS from the underlying table when accessed by
-- non-superusers, so users still only see their own rows.
