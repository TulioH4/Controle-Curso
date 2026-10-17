-- Centro de Controle: limits per account, so a single account cannot fill the database.
-- Run once in Supabase → SQL Editor → New query → paste → Run (after schema.sql). Safe to run again.
--
-- Anyone can create an account (there is no e-mail confirmation), and each account writes its own
-- rows in kv. Without limits, one account could upload gigabytes and fill the free plan (500 MB),
-- which turns the database read-only for everybody. The app stays far below these numbers: a whole
-- profile is usually under 1 MB.

-- Each item: key of 1 to 200 characters, value of at most 2 MB.
-- NOT VALID: rows already stored are not rechecked, only new writes.
alter table public.kv drop constraint if exists kv_key_tamanho;
alter table public.kv add constraint kv_key_tamanho check (char_length(key) between 1 and 200) not valid;
alter table public.kv drop constraint if exists kv_value_tamanho;
alter table public.kv add constraint kv_value_tamanho check (value is null or pg_column_size(value) <= 2 * 1024 * 1024) not valid;

-- Each account: at most 2000 items and 20 MB in total. Runs as the person writing, so Row Level
-- Security limits the count to their own rows (the same rows the check is about).
create or replace function public.kv_limite_conta() returns trigger
language plpgsql set search_path = '' as $$
declare
  itens int;
  total bigint;
begin
  select count(*), coalesce(sum(pg_column_size(value)), 0)
    into itens, total
    from public.kv
   where user_id = new.user_id and key <> new.key;
  if itens >= 2000 then
    raise exception 'Limite de itens da conta atingido' using errcode = '54000';
  end if;
  if total + coalesce(pg_column_size(new.value), 0) > 20 * 1024 * 1024 then
    raise exception 'Limite de espaço da conta atingido (20 MB)' using errcode = '54000';
  end if;
  return new;
end $$;

drop trigger if exists kv_limite_conta on public.kv;
create trigger kv_limite_conta before insert or update on public.kv
  for each row execute function public.kv_limite_conta();
