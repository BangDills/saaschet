-- ============================================================================
-- saaschet — fix ambiguous user_id in spend_credits RPC
-- ============================================================================
-- Run this once. The spend_credits function (0006) used bare `user_id` in
-- WHERE clauses of the SELECT FOR UPDATE and the UPDATE. With the RETURN
-- columns named `user_id`, Postgres couldn't tell whether `user_id` referred
-- to the output column or the table column → error 42702 "column reference
-- is ambiguous", so every spend call failed and credits were never charged.
--
-- Recreate the function with fully-qualified `public.user_credits.user_id`.
-- Drop first because the body changes; signature/return type are unchanged.
-- Do NOT re-grant to authenticated/anon — 0010 revoked client access; the
-- function is only called server-side via the service-role admin client.
-- ============================================================================

drop function if exists public.spend_credits(
  uuid, text, integer, text, uuid, integer
);

create function public.spend_credits(
  p_user_id        uuid,
  p_kind           text,
  p_cost           integer,
  p_model_id       text default null,
  p_conversation_id uuid default null,
  p_tool_count     integer default 0
)
returns table (
  user_id      uuid,
  tier         text,
  daily_limit  integer,
  used_today   integer,
  total_used   bigint,
  remaining    integer,
  resets_at    bigint,
  over_limit   boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today         date := (now() at time zone 'utc')::date;
  v_row           public.user_credits%rowtype;
  v_updated       boolean := false;
  v_next_used     integer;
  v_next_total    bigint;
begin
  if p_kind not in ('chat', 'agent') then
    raise exception 'Invalid kind: %', p_kind;
  end if;
  if p_cost < 0 then
    raise exception 'Cost must be non-negative';
  end if;

  -- Backfill a missing row (older users predating migration 2).
  insert into public.user_credits (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  -- Lock the row for the duration of this transaction. Concurrent calls
  -- block here until the first commits; each then re-reads the fresh value.
  -- Qualify user_id to avoid ambiguity with the RETURN column of the same name.
  select * into v_row
    from public.user_credits
   where public.user_credits.user_id = p_user_id
   for update;

  -- Lazy day rollover: if the stored window is stale, reset before charging.
  if v_row.day_started_on <> v_today then
    v_row.used_today := 0;
    v_row.day_started_on := v_today;
  end if;

  -- Atomic gate + bump. If this turn would exceed the daily limit, do NOT
  -- update and report over_limit so the caller can return 402.
  v_next_used  := v_row.used_today + p_cost;
  v_next_total := coalesce(v_row.total_used, 0) + p_cost;

  if v_next_used <= v_row.daily_limit then
    update public.user_credits
       set used_today     = v_next_used,
           total_used     = v_next_total,
           day_started_on = v_today,
           updated_at     = now()
     where public.user_credits.user_id = p_user_id;
    v_updated := true;

    -- Append-only ledger row, same transaction.
    insert into public.credit_usage_log
      (user_id, conversation_id, kind, cost, model_id, tool_count)
    values
      (p_user_id, p_conversation_id, p_kind, p_cost, p_model_id, p_tool_count);
  end if;

  return query
    select
      v_row.user_id,
      v_row.tier,
      v_row.daily_limit,
      case when v_updated then v_next_used else v_row.used_today end as used_today,
      case when v_updated then v_next_total else coalesce(v_row.total_used, 0) end
        as total_used,
      greatest(0, v_row.daily_limit -
        case when v_updated then v_next_used else v_row.used_today end
      ) as remaining,
      -- Next 00:00 UTC as epoch ms.
      extract(epoch from
        (date_trunc('day', now() at time zone 'utc')::timestamptz + interval '1 day')
      )::bigint * 1000 as resets_at,
      not v_updated as over_limit;
end;
$$;
