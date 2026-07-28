create table if not exists public.message_feedback (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating text not null check (rating in ('like', 'dislike')),
  reason text check (reason is null or char_length(reason) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (message_id, user_id)
);

create index if not exists message_feedback_user_id_idx
  on public.message_feedback(user_id);

drop trigger if exists message_feedback_touch_updated_at on public.message_feedback;
create trigger message_feedback_touch_updated_at
  before update on public.message_feedback
  for each row execute function public.touch_updated_at();

alter table public.message_feedback enable row level security;

drop policy if exists "message_feedback_select_own" on public.message_feedback;
create policy "message_feedback_select_own"
  on public.message_feedback for select
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
      where m.id = message_feedback.message_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "message_feedback_insert_own" on public.message_feedback;
create policy "message_feedback_insert_own"
  on public.message_feedback for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
      where m.id = message_feedback.message_id
        and m.role = 'assistant'
        and c.user_id = auth.uid()
    )
  );

drop policy if exists "message_feedback_update_own" on public.message_feedback;
create policy "message_feedback_update_own"
  on public.message_feedback for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
      where m.id = message_feedback.message_id
        and m.role = 'assistant'
        and c.user_id = auth.uid()
    )
  );

drop policy if exists "message_feedback_delete_own" on public.message_feedback;
create policy "message_feedback_delete_own"
  on public.message_feedback for delete
  using (auth.uid() = user_id);
