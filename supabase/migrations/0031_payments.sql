-- ============================================================================
-- saaschet — payments (QRIS Pro activation, "Jalur 1" manual-verify)
-- ============================================================================
-- Run this once, after 0030.
--
-- WHAT THIS IS
-- A self-hosted checkout for the Pro 24h tier. The static merchant QRIS is
-- converted to a dynamic payload per checkout (unique amount + bill number);
-- the user pays it, uploads proof, and an admin marks the payment paid, which
-- activates Pro. No payment gateway, no webhook — yet. The schema is
-- deliberately gateway-ready (`method`, `reference`, `expires_at`) so a real
-- provider (Midtrans/Xendit/…) can later set `paid` from a verified webhook
-- without a table rewrite.
--
-- THE ONE RULE THAT MUST HOLD
-- A client must NEVER be able to set status = 'paid'. Only the service role
-- (server) may. RLS below grants users insert/select of THEIR OWN rows and
-- nothing else — no user UPDATE at all. All status transitions happen through
-- SECURITY DEFINER functions owned by the server or an admin-gated server
-- action. The self-serve tier endpoint stays blocked for pro (see
-- src/app/api/profile/tier/route.ts).
-- ============================================================================

create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  plan            text not null default 'pro',
  method          text not null default 'qris_static',
  amount_base     integer not null check (amount_base > 0),
  unique_code     integer not null check (unique_code between 1 and 999),
  amount_total    integer not null check (amount_total > 0),
  reference       text not null unique,
  status          text not null default 'pending'
                  check (status in
                    ('pending', 'awaiting_confirmation', 'paid', 'expired', 'rejected')),
  proof_path      text,
  qris_payload    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  paid_at         timestamptz
);

-- A user should have at most one OPEN payment at a time (prevents QR spam and
-- keeps the unique-amount pool small). Partial index so paid/expired/rejected
-- rows never block a new checkout.
create unique index if not exists payments_one_open_per_user
  on public.payments (user_id)
  where status in ('pending', 'awaiting_confirmation');

create index if not exists payments_user_created
  on public.payments (user_id, created_at desc);

create index if not exists payments_status_pending
  on public.payments (status)
  where status in ('pending', 'awaiting_confirmation');

-- updated_at housekeeping.
create or replace function public.set_payments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_payments_updated_at on public.payments;
create trigger trg_payments_updated_at
  before update on public.payments
  for each row execute function public.set_payments_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.payments enable row level security;

-- Users can read their own payments.
create policy payments_select_own
  on public.payments for select
  to authenticated
  using (auth.uid() = user_id);

-- Users can create a payment for themselves only, and never pre-set a paid
-- status or a paid_at timestamp. Status must start as 'pending'.
create policy payments_insert_own
  on public.payments for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and paid_at is null
  );

-- NO user UPDATE or DELETE policy. Users cannot mutate their payment rows at
-- all — status changes happen server-side via the functions below or the
-- admin action. (The service role bypasses RLS entirely.)

-- ---------------------------------------------------------------------------
-- mark_payment_received — the user taps "Saya sudah bayar" and attaches proof.
-- Moves pending -> awaiting_confirmation for the OWNER ONLY. Cannot set paid.
-- Returns the updated status so the UI can react.
-- ---------------------------------------------------------------------------
create or replace function public.mark_payment_received(
  p_payment_id uuid,
  p_proof_path text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.payments%rowtype;
begin
  select * into v_row from public.payments where id = p_payment_id for update;

  if not found then
    raise exception 'payment not found';
  end if;

  -- Owner only. The service role passes auth.uid() = null, so this check only
  -- bites for real user sessions — exactly what we want.
  if v_row.user_id <> auth.uid() then
    raise exception 'forbidden';
  end if;

  if v_row.status = 'expired' or now() >= v_row.expires_at then
    update public.payments
       set status = 'expired'
     where id = p_payment_id;
    return 'expired';
  end if;

  if v_row.status <> 'pending' then
    -- Idempotent re-tap: already awaiting/paid/rejected — just report it.
    return v_row.status;
  end if;

  update public.payments
     set status = 'awaiting_confirmation',
         proof_path = p_proof_path
   where id = p_payment_id;

  return 'awaiting_confirmation';
end;
$$;

-- Only authenticated users call this; service role doesn't need the grant.
revoke all on function public.mark_payment_received(uuid, text) from public;
grant execute on function public.mark_payment_received(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private bucket for payment proof screenshots.
-- Path convention: <user_id>/<payment_id>-<filename>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', false)
on conflict (id) do nothing;

-- Users upload into their OWN folder.
create policy payment_proofs_insert_own
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users read their OWN proofs.
create policy payment_proofs_select_own
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Admins (profiles.role = 'admin') can read ALL proofs to verify payments.
create policy payment_proofs_select_admin
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'payment-proofs'
    and exists (
      select 1 from public.profiles
       where id = auth.uid() and role = 'admin'
    )
  );
