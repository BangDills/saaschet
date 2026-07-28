-- ============================================================================
-- Projects — folder/grouping for conversations
-- ============================================================================
-- Adds a per-user `projects` table and a nullable `project_id` FK on
-- `conversations` so chats can be grouped into named project folders.
--
-- RLS follows the same "users only see their own data" pattern as
-- conversations: every row is owned by auth.uid() = user_id, and a
-- conversation may only point at a project owned by the same user
-- (enforced by a policy + ON DELETE SET NULL).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- projects
-- ----------------------------------------------------------------------------
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  color       text not null default 'default',
  -- optional short description shown in the sidebar tooltip
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint projects_name_length check (char_length(name) between 1 and 100),
  constraint projects_color_format check (color ~ '^[a-z0-9_-]{0,40}$')
);

create index if not exists projects_user_id_idx
  on public.projects(user_id);

create index if not exists projects_user_updated_idx
  on public.projects(user_id, updated_at desc);

-- updated_at trigger (reuses the shared touch_updated_at() helper from 0001).
drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- conversations.project_id
-- ----------------------------------------------------------------------------
alter table public.conversations
  add column if not exists project_id uuid references public.projects(id) on delete set null;

create index if not exists conversations_project_id_idx
  on public.conversations(project_id)
  where project_id is not null;

-- Keep queries that filter "chats in this project, newest first" fast.
create index if not exists conversations_project_user_updated_idx
  on public.conversations(project_id, user_id, updated_at desc)
  where project_id is not null;

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.projects enable row level security;

-- projects: users only see / mutate their own rows
drop policy if exists "projects_select_own" on public.projects;
create policy "projects_select_own"
  on public.projects for select
  using (auth.uid() = user_id);

drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own"
  on public.projects for insert
  with check (auth.uid() = user_id);

drop policy if exists "projects_update_own" on public.projects;
create policy "projects_update_own"
  on public.projects for update
  using (auth.uid() = user_id);

drop policy if exists "projects_delete_own" on public.projects;
create policy "projects_delete_own"
  on public.projects for delete
  using (auth.uid() = user_id);

-- Conversation rows that carry a project_id must point at one of the user's
-- own projects. This complements the existing conversations_*_own policies
-- (which already restrict by user_id) by also blocking writes that try to
-- pin a conversation to another user's project.
drop policy if exists "conversations_insert_project_own" on public.conversations;
create policy "conversations_insert_project_own"
  on public.conversations for insert
  with check (
    project_id is null or exists (
      select 1 from public.projects p
      where p.id = conversations.project_id and p.user_id = auth.uid()
    )
  );

drop policy if exists "conversations_update_project_own" on public.conversations;
create policy "conversations_update_project_own"
  on public.conversations for update
  using (
    project_id is null or exists (
      select 1 from public.projects p
      where p.id = conversations.project_id and p.user_id = auth.uid()
    )
  );
