-- The daily orphan cover-file sweep (docs/DECISIONS.md, "Dev defaults"): pg_cron asks the sweep-covers
-- Edge Function to run, with a secret from Vault. Plain Postgres has neither pg_net nor Vault, so both
-- are stood in for here; the storage side (orphan_cover_paths) is tested against the local stack.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

select test.logout();
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000b51');
insert into public.profiles (id, username) values ('00000000-0000-0000-0000-000000000b51', 'sweepy');

-- 1. The settings: off until set up, admin-readable, changed only by migrations / the service role
select test.ok((select not enabled and url is null from public.cover_sweep_settings), 'the sweep starts switched off, with no address');
select test.ok(test.error_of($$insert into public.cover_sweep_settings (id) values (true)$$) is not null, 'there is only ever one settings row');
select test.ok(test.error_of($$update public.cover_sweep_settings set enabled = true$$) like '%cover_sweep_settings_url%',
  'it cannot be switched on without an address');
select test.ok(test.error_of($$update public.cover_sweep_settings set url = 'http://insecure.example/x'$$) like '%cover_sweep_settings_url%',
  'the address must be https (the secret travels with it)');
select test.login('00000000-0000-0000-0000-000000000b51');
select test.ok((select count(*) from public.cover_sweep_settings) = 0, 'readers cannot see the sweep settings');
select test.logout();
update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-000000000b51';
select test.login('00000000-0000-0000-0000-000000000b51');
select test.ok((select count(*) from public.cover_sweep_settings) = 1, 'admins can see them');
select test.ok(test.error_of($$update public.cover_sweep_settings set url = 'https://attacker.example/'$$) like '%permission denied%',
  'not even app admins can change where the sweep secret goes');
select test.ok(test.error_of($$select public.request_cover_sweep()$$) like '%permission denied%', 'readers cannot start a sweep');
select test.logout();
update public.profiles set is_admin = false where id = '00000000-0000-0000-0000-000000000b51';
set role anon;
select test.ok(test.error_of($$select public.request_cover_sweep()$$) like '%permission denied%', 'nor can signed-out visitors');
reset role;

-- 2. Asking the Edge Function to sweep ------------------------------------------------------------
select test.ok(test.error_of($$select public.request_cover_sweep()$$) is null, 'without pg_net or Vault it does nothing, quietly');

create schema net;
create table test.sweep_calls (url text, body jsonb, headers jsonb, timeout_milliseconds int);
create function net.http_post(url text, body jsonb, headers jsonb, timeout_milliseconds int) returns bigint language plpgsql as $f$
begin insert into test.sweep_calls values (url, body, headers, timeout_milliseconds); return 1; end $f$;
create schema vault;
create table vault.decrypted_secrets (name text, decrypted_secret text);

select public.request_cover_sweep();
select test.ok((select count(*) from test.sweep_calls) = 0, 'switched off: no request');

update public.cover_sweep_settings set url = 'https://project.supabase.co/functions/v1/sweep-covers', enabled = true;
select public.request_cover_sweep();
select test.ok((select count(*) from test.sweep_calls) = 0, 'no secret in Vault: no request (it would only be refused)');

insert into vault.decrypted_secrets values ('cover_sweep_secret', 's3cret-value');
select public.request_cover_sweep();
select test.ok((select count(*) from test.sweep_calls) = 1, 'switched on with a secret: one request');
select test.ok((select url from test.sweep_calls) = 'https://project.supabase.co/functions/v1/sweep-covers', 'to the configured address');
select test.ok((select headers ->> 'x-sweep-secret' from test.sweep_calls) = 's3cret-value', 'carrying the secret from Vault');

update public.cover_sweep_settings set enabled = false, url = null;
drop function net.http_post(text, jsonb, jsonb, int);
drop schema net;
drop table vault.decrypted_secrets;
drop schema vault;
drop table test.sweep_calls;

-- 3. Listing orphan files needs Supabase Storage; without it the function does not exist ----------
select test.ok(to_regproc('public.orphan_cover_paths') is null, 'no storage schema, no orphan_cover_paths');

\o
\echo 'COVER SWEEP RULES PASSED'
