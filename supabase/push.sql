-- Centro de Controle: push notifications (reminders with the app closed).
-- Run once in Supabase → SQL Editor → New query → paste → Run,
-- after deploying the "lembretes" Edge Function (see supabase/functions/lembretes).

-- Devices that accepted notifications. A user only sees and manages their own rows;
-- the Edge Function reads them with the service role.
create table if not exists public.push_subscriptions (
  endpoint   text        primary key,
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  p256dh     text        not null,
  auth       text        not null,
  tz         text        not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push: read own"   on public.push_subscriptions;
drop policy if exists "push: insert own" on public.push_subscriptions;
drop policy if exists "push: update own" on public.push_subscriptions;
drop policy if exists "push: delete own" on public.push_subscriptions;
create policy "push: read own"   on public.push_subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy "push: insert own" on public.push_subscriptions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "push: update own" on public.push_subscriptions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "push: delete own" on public.push_subscriptions for delete to authenticated using ((select auth.uid()) = user_id);

-- What was already sent, so every reminder goes out once. Only the service role touches it.
create table if not exists public.push_log (
  user_id uuid        not null references auth.users(id) on delete cascade,
  tag     text        not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, tag)
);
alter table public.push_log enable row level security;

-- Run the function every 15 minutes. It decides what is due (morning summary,
-- evening heads-up, exam in two hours) in each device's time zone.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'centro-lembretes';
select cron.schedule(
  'centro-lembretes',
  '*/15 * * * *',
  $$ select net.http_post(
       url := 'https://ehcbkoxbqqwiibjyzhoy.supabase.co/functions/v1/lembretes',
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := '{}'::jsonb
     ) $$
);

-- Old log rows are only needed for a couple of days.
select cron.unschedule(jobid) from cron.job where jobname = 'centro-lembretes-limpeza';
select cron.schedule('centro-lembretes-limpeza', '0 4 * * *', $$ delete from public.push_log where sent_at < now() - interval '3 days' $$);
