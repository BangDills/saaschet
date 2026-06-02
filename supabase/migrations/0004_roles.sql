-- ============================================================================
-- Add role column to profiles
-- ============================================================================
-- Possible values: 'user' (default) and 'admin'.
-- Only admins can see the main dashboard stats and users list.

alter table public.profiles
  add column if not exists role text not null default 'user'
  check (role in ('user', 'admin'));

-- To make yourself admin, run in Supabase SQL Editor:
--   UPDATE public.profiles SET role = 'admin' WHERE email = 'your@email.com';
