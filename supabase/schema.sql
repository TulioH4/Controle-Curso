-- Centro de Controle: cloud storage for the dashboard.
-- Run once in Supabase → SQL Editor → New query → paste → Run.
--
-- One row per (user, storage key). The app keeps localStorage as an offline
-- cache and syncs each key here; Row Level Security guarantees a user can only
-- ever read or write their own rows.

create table if not exists public.kv (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  key        text        not null,
  value      jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.kv enable row level security;

drop policy if exists "kv: read own rows"   on public.kv;
drop policy if exists "kv: insert own rows" on public.kv;
drop policy if exists "kv: update own rows" on public.kv;
drop policy if exists "kv: delete own rows" on public.kv;

create policy "kv: read own rows"   on public.kv for select to authenticated using ((select auth.uid()) = user_id);
create policy "kv: insert own rows" on public.kv for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "kv: update own rows" on public.kv for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "kv: delete own rows" on public.kv for delete to authenticated using ((select auth.uid()) = user_id);

-- Live updates between devices (PC ↔ phone).
alter table public.kv replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'kv'
  ) then
    alter publication supabase_realtime add table public.kv;
  end if;
end $$;
