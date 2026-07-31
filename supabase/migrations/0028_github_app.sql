-- ============================================================================
-- 0028_github_app.sql — GitHub App installations (replaces OAuth token flow)
-- ============================================================================
-- Adds tables to record which GitHub App installations are connected to each
-- Celiuz AI user. Tokens are NEVER stored here — installation access tokens
-- are minted on demand (1-hour TTL) from the App's private key, so a database
-- dump leaks only metadata, not credentials.
--
-- Apply after 0027_reserve_credits.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- github_installations: one row per GitHub App installation connected by a
-- user. A user may have several (personal account + orgs).
-- ----------------------------------------------------------------------------
create table if not exists public.github_installations (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  installation_id      bigint not null,               -- GitHub's installation id
  account_login        text not null,                 -- "octocat" or "my-org"
  account_type         text not null default 'User'
                       check (account_type in ('User', 'Organization')),
  repository_selection text not null default 'all'
                       check (repository_selection in ('all', 'selected')),
  permissions          jsonb not null default '{}',   -- {"contents":"write", ...}
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint github_installations_unique_per_user
    unique (user_id, installation_id)
);

create index if not exists github_installations_user_idx
  on public.github_installations(user_id);

create index if not exists github_installations_installation_idx
  on public.github_installations(installation_id);

-- ----------------------------------------------------------------------------
-- github_installation_repos: the repos visible to an installation when the
-- user picked "selected repositories". Synced at connect time and kept fresh
-- by the webhook (installation_repositories events) plus the redirect-on-
-- update callback. Empty when repository_selection = 'all'.
-- ----------------------------------------------------------------------------
create table if not exists public.github_installation_repos (
  id              uuid primary key default gen_random_uuid(),
  installation_id uuid not null references public.github_installations(id) on delete cascade,
  repo_id         bigint not null,                    -- GitHub repo id
  full_name       text not null,                      -- "owner/repo"
  is_private      boolean not null default false,
  created_at      timestamptz not null default now(),

  constraint github_installation_repos_unique
    unique (installation_id, repo_id)
);

create index if not exists github_installation_repos_inst_idx
  on public.github_installation_repos(installation_id);

-- updated_at trigger (reuses touch_updated_at from 0001_initial_schema.sql)
drop trigger if exists github_installations_touch on public.github_installations;
create trigger github_installations_touch
  before update on public.github_installations
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
-- Both tables hold only metadata (no secrets), so users may read their own
-- rows. All writes happen server-side via the service-role admin client,
-- which bypasses RLS — hence no insert/update/delete policies here.
-- ----------------------------------------------------------------------------

alter table public.github_installations      enable row level security;
alter table public.github_installation_repos enable row level security;

drop policy if exists "gh_inst_select_own" on public.github_installations;
create policy "gh_inst_select_own"
  on public.github_installations for select
  using (auth.uid() = user_id);

drop policy if exists "gh_inst_repos_select_own" on public.github_installation_repos;
create policy "gh_inst_repos_select_own"
  on public.github_installation_repos for select
  using (
    exists (
      select 1 from public.github_installations gi
      where gi.id = github_installation_repos.installation_id
        and gi.user_id = auth.uid()
    )
  );
