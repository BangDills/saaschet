-- ============================================================================
-- saaschet — lock profiles.role against self-promotion
-- ============================================================================
-- Run this once after 0004_roles.sql.
--
-- Why: the `profiles_update_own` RLS policy (migration 0001) uses
-- `using (auth.uid() = id)` with no column restriction, so an authenticated
-- user could run `UPDATE profiles SET role='admin' WHERE id=auth.uid()` via
-- the anon/authenticated Supabase client and promote themselves to admin.
-- That grants /users access, Pro self-activation, and cross-user deletes.
--
-- Fix: revoke UPDATE on the role column from authenticated/anon so only the
-- service role (admin client) can change it. RLS still lets users update
-- their own non-role columns.
-- ============================================================================

-- Revoke all column-level privileges on profiles.role from client roles.
revoke update (role) on public.profiles from authenticated, anon;

-- Belt-and-suspenders: a WITH CHECK that blocks the role value from changing
-- during a self-update. If a future code path grants the column back, this
-- still stops the escalation. Drop the old permissive policy first.
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    -- The role column must be unchanged by this update.
    and role = (
      select p.role
        from public.profiles p
       where p.id = auth.uid()
    )
  );

-- Service role bypasses RLS, so admin tooling (updateUserTierAction etc.)
-- and the SQL-Editor bootstrap can still set role='admin'.
