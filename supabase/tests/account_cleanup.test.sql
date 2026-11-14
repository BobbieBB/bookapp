-- Accounts that never got a profile (signed up, never accepted the terms) are deleted after 30 days
-- (docs/DATA_MODEL.md, "Accounts without a profile"). Accounts with a profile are never swept.
-- Runs after spoiler_rules.test.sql (needs its test schema).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

select test.logout();
insert into auth.users (id, email, created_at) values
  ('00000000-0000-0000-0000-0000000ac001', 'old-ghost@example.com',   now() - interval '31 days'),
  ('00000000-0000-0000-0000-0000000ac002', 'young-ghost@example.com', now() - interval '29 days'),
  ('00000000-0000-0000-0000-0000000ac003', 'old-reader@example.com',  now() - interval '400 days'),
  ('00000000-0000-0000-0000-0000000ac004', 'undated@example.com',     null);
insert into public.profiles (id, username) values ('00000000-0000-0000-0000-0000000ac003', 'oldreader');
-- What a profileless account can already have made: analytics (sign_up, the first app_open) and an opt-out.
insert into public.analytics_opt_outs (user_id) values ('00000000-0000-0000-0000-0000000ac001');
insert into public.analytics_events (user_id, name) values ('00000000-0000-0000-0000-0000000ac001', 'sign_up');

-- 1. Only the service side may sweep ---------------------------------------------------------------
select test.login('00000000-0000-0000-0000-0000000ac003');
select test.ok(test.error_of($$select public.sweep_profileless_accounts()$$) like '%permission denied%', 'readers cannot sweep accounts');
select test.logout();
set role anon;
select test.ok(test.error_of($$select public.sweep_profileless_accounts()$$) like '%permission denied%', 'nor can signed-out visitors');
reset role;

-- 2. The sweep ------------------------------------------------------------------------------------
select test.ok(public.sweep_profileless_accounts() = 1, 'one account is swept, and the count says so');
select test.ok(not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000ac001'),
  'a profileless account older than 30 days is deleted');
select test.ok(not exists (select 1 from public.analytics_events where user_id = '00000000-0000-0000-0000-0000000ac001')
  and not exists (select 1 from public.analytics_opt_outs where user_id = '00000000-0000-0000-0000-0000000ac001'),
  'with what it made before it had a profile');
select test.ok(exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000ac002'),
  'a profileless account younger than 30 days is kept');
select test.ok(exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000ac003')
  and exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000ac003'),
  'an old account with a profile is kept, however old');
select test.ok(exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000ac004'),
  'an account with no sign-up date is kept');
select test.ok(public.sweep_profileless_accounts() = 0, 'running it again sweeps nothing');
select test.ok(public.sweep_profileless_accounts('28 days') = 1
  and not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000ac002'),
  'the age is a parameter');

-- 3. The daily job: plain Postgres has no pg_cron, so stand one in and apply the migration again ----
create schema cron;
create table cron.job (jobname text primary key, schedule text, command text);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $f$
  insert into cron.job values (job_name, schedule, command)
    on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command;
  select 1::bigint
$f$;
\ir ../migrations/20261114000600_account_cleanup.sql
select test.ok((select command from cron.job where jobname = 'sweep-profileless-accounts') = 'select public.sweep_profileless_accounts()',
  'the sweep is registered as a pg_cron job');
select test.ok((select schedule from cron.job where jobname = 'sweep-profileless-accounts') ~ '^[0-9]+ [0-9]+ \* \* \*$',
  'once a day');
drop schema cron cascade;
delete from auth.users where id in ('00000000-0000-0000-0000-0000000ac003', '00000000-0000-0000-0000-0000000ac004');

\o
\echo 'ACCOUNT CLEANUP RULES PASSED'
