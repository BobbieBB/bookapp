-- Accounts without a profile (docs/DATA_MODEL.md, "Accounts without a profile"; docs/DECISIONS.md,
-- "Retention: accounts that never finish signing up", 14 Nov 2026). Signing up creates an auth.users
-- row holding the e-mail address; the profile only comes once the reader accepts the terms. An
-- account that never gets that far is deleted once 30 days have passed since both its sign-up and its
-- last sign-in: a confirmed reader who signs in but has not accepted the terms yet is active and kept.
-- An unconfirmed account goes 30 days after sign-up (a late confirmation finds it gone; the reader
-- signs up again). Accounts WITH a profile are never swept, however long they sit unused: that is a
-- PO decision.
--
-- What a profileless account can have made goes with it through "on delete cascade": analytics
-- events (sign_up, the first app_open) and an analytics opt-out. Everything else (library, covers,
-- comments, reports, push tokens...) needs a profile first, and a cover upload needs a library entry,
-- so there are no Storage files to remove.

-- The 30 days live here, in the default, and nowhere else: the daily job calls it without arguments.
-- An account's age runs from the later of sign-up and last sign-in. Accounts with neither date are
-- kept (we cannot tell how old they are).
create or replace function public.sweep_profileless_accounts(p_older_than interval default '30 days')
returns int language plpgsql security definer set search_path = '' as $$
declare
  candidates uuid[];
  n int;
begin
  -- A reader accepting the terms right now holds a KEY SHARE lock on their auth.users row (the
  -- profile's foreign key check) until their transaction ends. FOR UPDATE conflicts with it, so
  -- SKIP LOCKED leaves those accounts out of this run; and once we hold the lock, a profile insert
  -- that starts later waits for us and then fails on the missing user instead of slipping past.
  select array_agg(id) into candidates from (
    select u.id from auth.users u
    where greatest(u.created_at, coalesce(u.last_sign_in_at, u.created_at)) < now() - p_older_than
      and not exists (select 1 from public.profiles p where p.id = u.id)
    for update of u skip locked
  ) c;
  -- Re-check in the DELETE, with this statement's newer snapshot: a profile committed between the
  -- first look and taking the lock is now visible, and its account stays.
  delete from auth.users u
  where u.id = any(coalesce(candidates, '{}'))
    and not exists (select 1 from public.profiles p where p.id = u.id);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.sweep_profileless_accounts(interval) from public, anon, authenticated, service_role;

-- Every day at 03:41 UTC (pg_cron, Supabase only; the test stands in a cron schema).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  end if;
  if to_regnamespace('cron') is not null then
    perform cron.schedule('sweep-profileless-accounts', '41 3 * * *', 'select public.sweep_profileless_accounts()');
  end if;
end $$;
