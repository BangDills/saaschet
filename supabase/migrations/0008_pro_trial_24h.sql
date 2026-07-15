-- ============================================================================
-- saaschet — Pro trial 24h expiry + admin activation
-- ============================================================================
-- Run this once after 0003_tiers.sql.
--
-- Promo: Pro is a 24-hour trial, not a permanent tier. Activation is done by
-- an admin (after the user pays via WhatsApp). This migration:
--   1. Adds tier_expires_at to user_credits.
--   2. Rewrites set_user_tier so 'pro' sets tier_expires_at = now()+24h,
--      'free' clears it. (Self-serve downgrade to free stays allowed.)
--   3. Adds set_user_tier_by_admin(target_user, tier) so an admin can set
--      another user's tier — the self-serve function only owns the caller's
--      row. Auto-downgrade on expiry is handled in app code (getCreditSnapshot).
-- ============================================================================

alter table public.user_credits
  add column if not exists tier_expires_at timestamptz;

-- Backfill: any existing pro users (from the old permanent model) get no
-- expiry, so they keep working until someone re-activates. Leave null = never
-- expires. New activations always set a 24h window.

-- ----------------------------------------------------------------------------
-- Self-serve tier switch (caller's own row). Pro → 24h, free → no expiry.
-- Drop first: the signature's return type changed (added tier_expires_at),
-- and CREATE OR REPLACE cannot alter a function's return type.
-- ----------------------------------------------------------------------------
drop function if exists public.set_user_tier(text);

create function public.set_user_tier(p_tier text)
returns table (
  user_id uuid,
  tier text,
  daily_limit integer,
  used_today integer,
  remaining integer,
  tier_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_limit integer;
  v_expires timestamptz;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;
  if p_tier not in ('free', 'pro') then
    raise exception 'Unknown tier: %', p_tier;
  end if;

  v_limit := case p_tier when 'pro' then 3000 else 50 end;
  v_expires := case when p_tier = 'pro' then now() + interval '24 hours' else null end;

  update public.user_credits c
     set tier = p_tier,
         daily_limit = v_limit,
         tier_expires_at = v_expires
   where c.user_id = v_user;

  if not found then
    insert into public.user_credits (user_id, tier, daily_limit, tier_expires_at)
    values (v_user, p_tier, v_limit, v_expires);
  end if;

  return query
    select c.user_id,
           c.tier,
           c.daily_limit,
           c.used_today,
           greatest(0, c.daily_limit - c.used_today) as remaining,
           c.tier_expires_at
      from public.user_credits c
     where c.user_id = v_user;
end;
$$;

grant execute on function public.set_user_tier(text) to authenticated;

-- ----------------------------------------------------------------------------
-- Admin tier activation for ANY user. Caller must be an admin (role checked
-- in the app route before calling). Pro → 24h, free → clear expiry.
-- ----------------------------------------------------------------------------
create or replace function public.set_user_tier_by_admin(
  p_target_user uuid,
  p_tier text
)
returns table (
  user_id uuid,
  tier text,
  daily_limit integer,
  used_today integer,
  remaining integer,
  tier_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_expires timestamptz;
begin
  if p_tier not in ('free', 'pro') then
    raise exception 'Unknown tier: %', p_tier;
  end if;

  v_limit := case p_tier when 'pro' then 3000 else 50 end;
  v_expires := case when p_tier = 'pro' then now() + interval '24 hours' else null end;

  update public.user_credits c
     set tier = p_tier,
         daily_limit = v_limit,
         tier_expires_at = v_expires
   where c.user_id = p_target_user;

  if not found then
    insert into public.user_credits (user_id, tier, daily_limit, tier_expires_at)
    values (p_target_user, p_tier, v_limit, v_expires);
  end if;

  return query
    select c.user_id,
           c.tier,
           c.daily_limit,
           c.used_today,
           greatest(0, c.daily_limit - c.used_today) as remaining,
           c.tier_expires_at
      from public.user_credits c
     where c.user_id = p_target_user;
end;
$$;

grant execute on function public.set_user_tier_by_admin(uuid, text) to authenticated;
