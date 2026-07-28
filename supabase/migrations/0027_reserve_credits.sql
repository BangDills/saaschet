-- ============================================================================
-- saaschet — atomic credit reservation (closes the parallel-request hole)
-- ============================================================================
-- Run this once, after 0026.
--
-- THE HOLE BEING CLOSED
-- The pre-flight gate (assertCanSpend) only READ a snapshot; the atomic
-- charge (spend_credits) ran AFTER the turn finished. N parallel requests
-- could all pass the read-only gate with 1 credit left, all call the model
-- provider, and only at settle time would N-1 of them report over_limit —
-- after the inference cost was already paid.
--
-- NEW FLOW (server code in src/lib/credits/server.ts):
--   1. reserve_credits(user, base_cost)  — atomic check+increment under a
--      row lock BEFORE the model runs. Over limit → the turn never starts.
--   2. settle_reserved_credits(...)      — after the turn:
--        success: adjust to the real cost (base + tool calls) and write the
--                 ledger row;
--        failure/abort: refund the reservation, no ledger row — failed
--                 turns stay free, exactly as before.
--
-- Both functions are server-only (service role); client roles are revoked,
-- mirroring 0016's treatment of spend_credits. spend_credits itself is kept
-- untouched: the server falls back to it if these functions don't exist yet
-- (deploy raced this migration), so apply order stays forgiving.
-- ============================================================================

create or replace function public.reserve_credits(
  p_user_id uuid,
  p_amount  integer
)
returns table (
  ok         boolean,
  remaining  integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_row   public.user_credits%rowtype;
begin
  if p_amount <= 0 then
    raise exception 'Reservation amount must be positive';
  end if;

  insert into public.user_credits (user_id)
  values (p_user_id)
  on conflict on constraint user_credits_pkey do nothing;

  select * into v_row
    from public.user_credits
   where public.user_credits.user_id = p_user_id
   for update;

  -- Lazy day rollover, same convention as spend_credits.
  if v_row.day_started_on <> v_today then
    v_row.used_today := 0;
    v_row.day_started_on := v_today;
  end if;

  if v_row.used_today + p_amount <= v_row.daily_limit then
    update public.user_credits
       set used_today     = v_row.used_today + p_amount,
           day_started_on = v_today,
           updated_at     = now()
     where public.user_credits.user_id = p_user_id;

    return query select
      true,
      greatest(0, v_row.daily_limit - (v_row.used_today + p_amount));
  else
    -- Persist the rollover even when refusing, so reads stay consistent.
    update public.user_credits
       set used_today     = v_row.used_today,
           day_started_on = v_today,
           updated_at     = now()
     where public.user_credits.user_id = p_user_id;

    return query select
      false,
      greatest(0, v_row.daily_limit - v_row.used_today);
  end if;
end;
$$;

create or replace function public.settle_reserved_credits(
  p_user_id         uuid,
  p_reserved        integer,
  p_final_cost      integer,
  p_success         boolean,
  p_kind            text default 'chat',
  p_model_id        text default null,
  p_conversation_id uuid default null,
  p_tool_count      integer default 0
)
returns table (
  used_today integer,
  over_limit boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today    date := (now() at time zone 'utc')::date;
  v_row      public.user_credits%rowtype;
  v_new_used integer;
begin
  if p_kind not in ('chat', 'agent') then
    raise exception 'Invalid kind: %', p_kind;
  end if;
  if p_reserved < 0 or p_final_cost < 0 then
    raise exception 'Amounts must be non-negative';
  end if;

  select * into v_row
    from public.user_credits
   where public.user_credits.user_id = p_user_id
   for update;

  -- If the UTC day rolled between reserve and settle, the reservation was
  -- wiped by the rollover; greatest(0, ...) keeps the math from going
  -- negative in that rare window.
  if v_row.day_started_on <> v_today then
    v_row.used_today := 0;
    v_row.day_started_on := v_today;
  end if;

  if p_success then
    -- Adjust from the reserved base to the real cost (base + tool calls).
    -- Tool overage may exceed the daily limit — accepted, as before: the
    -- work already happened; over_limit is informational.
    v_new_used := greatest(0, v_row.used_today + (p_final_cost - p_reserved));

    update public.user_credits
       set used_today     = v_new_used,
           total_used     = coalesce(v_row.total_used, 0) + p_final_cost,
           day_started_on = v_today,
           updated_at     = now()
     where public.user_credits.user_id = p_user_id;

    insert into public.credit_usage_log
      (user_id, conversation_id, kind, cost, model_id, tool_count)
    values
      (p_user_id, p_conversation_id, p_kind, p_final_cost, p_model_id, p_tool_count);

    return query select v_new_used, v_new_used > v_row.daily_limit;
  else
    -- Failed/aborted turn: give the reservation back. No ledger row.
    v_new_used := greatest(0, v_row.used_today - p_reserved);

    update public.user_credits
       set used_today     = v_new_used,
           day_started_on = v_today,
           updated_at     = now()
     where public.user_credits.user_id = p_user_id;

    return query select v_new_used, false;
  end if;
end;
$$;

-- Server-only, like spend_credits after 0016.
revoke execute on function public.reserve_credits(uuid, integer)
  from authenticated, anon;
revoke execute on function public.settle_reserved_credits(
  uuid, integer, integer, boolean, text, text, uuid, integer
) from authenticated, anon;
