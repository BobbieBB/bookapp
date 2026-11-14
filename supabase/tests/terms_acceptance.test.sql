-- Accepting the terms and confirming your age (docs/DECISIONS.md, "Terms and age: ticked at sign-up"):
-- the server stamps when the terms were accepted, the reader can neither backdate nor withdraw it,
-- and the terms are never accepted without the age tick. Runs after spoiler_rules.test.sql (needs its
-- test schema). Readers read their own terms columns through my_profile() (20261114000000_profile_privacy.sql).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

select test.logout();
-- runs `sql` and returns "SQLSTATE: message", or null if it succeeded
create function test.failure_of(sql text) returns text language plpgsql as $$
begin
  execute sql;
  return null;
exception when others then
  return sqlstate || ': ' || sqlerrm;
end $$;
grant execute on function test.failure_of(text) to authenticated;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000ee001'), ('00000000-0000-0000-0000-0000000ee002'),
  ('00000000-0000-0000-0000-0000000ee003'), ('00000000-0000-0000-0000-0000000ee004');

-- Hana signs up today, but her phone claims she accepted in 2000.
select test.login('00000000-0000-0000-0000-0000000ee001');
insert into public.profiles (id, username, terms_version, age_confirmed, terms_accepted_at)
  values ('00000000-0000-0000-0000-0000000ee001', 'terms_hana', '2026-01', true, '2000-01-01');
select test.ok((select terms_accepted_at > now() - interval '1 minute' from public.my_profile()),
  'the server stamps the acceptance on insert, ignoring the time the app sent');

-- Ivo signed up before the terms existed.
select test.login('00000000-0000-0000-0000-0000000ee002');
insert into public.profiles (id, username, terms_accepted_at)
  values ('00000000-0000-0000-0000-0000000ee002', 'terms_ivo', '2000-01-01');
select test.ok((select terms_version is null and terms_accepted_at is null and not age_confirmed
  from public.my_profile()), 'without terms there is no acceptance time and no age tick');

-- Accepting later stamps the time on update.
update public.profiles set terms_version = '2026-01', age_confirmed = true where id = '00000000-0000-0000-0000-0000000ee002';
select test.ok((select terms_version = '2026-01' and age_confirmed and terms_accepted_at > now() - interval '1 minute'
  from public.my_profile()), 'accepting on update stamps the time');
select test.logout();
create temp table ivo_before as select terms_accepted_at from public.profiles where username = 'terms_ivo';

-- The app cannot move the time itself.
select test.login('00000000-0000-0000-0000-0000000ee002');
select test.ok(test.failure_of($$update public.profiles set terms_accepted_at = '2000-01-01'
  where id = '00000000-0000-0000-0000-0000000ee002'$$) = '42501: permission denied for table profiles',
  'a reader cannot set the acceptance time');
select test.logout();
select test.ok((select p.terms_accepted_at = b.terms_accepted_at from public.profiles p, ivo_before b where p.username = 'terms_ivo'),
  'the acceptance time is unchanged');

-- An unrelated edit keeps the time, even from the database owner; a new version stamps a new one.
update public.profiles set terms_accepted_at = '2020-01-01' where id = '00000000-0000-0000-0000-0000000ee002';
select test.ok((select p.terms_accepted_at = b.terms_accepted_at from public.profiles p, ivo_before b where p.username = 'terms_ivo'),
  'nobody can move the time without a new version');
select test.login('00000000-0000-0000-0000-0000000ee002');
update public.profiles set reads_fanfic = true, favourite_genres = '{fantasy}' where id = '00000000-0000-0000-0000-0000000ee002';
select test.logout();
select test.ok((select p.terms_accepted_at = b.terms_accepted_at and p.reads_fanfic from public.profiles p, ivo_before b where p.username = 'terms_ivo'),
  'an unrelated profile edit leaves the acceptance time alone');
select test.login('00000000-0000-0000-0000-0000000ee002');
update public.profiles set terms_version = '2026-02' where id = '00000000-0000-0000-0000-0000000ee002';
select test.logout();
select test.ok((select p.terms_version = '2026-02' and p.terms_accepted_at > b.terms_accepted_at from public.profiles p, ivo_before b where p.username = 'terms_ivo'),
  'accepting a new version stamps a new time');
drop table ivo_before;
create temp table ivo_before as select terms_accepted_at from public.profiles where username = 'terms_ivo';

-- An older (or invented, earlier-sorting) version cannot replace the accepted one to re-stamp the time.
select test.login('00000000-0000-0000-0000-0000000ee002');
select test.ok(test.failure_of($$update public.profiles set terms_version = '2026-01' where id = '00000000-0000-0000-0000-0000000ee002'$$)
  = 'LV001: an older version of the terms cannot replace a newer one', 'going back to an older version is refused');
select test.ok(test.failure_of($$update public.profiles set terms_version = '1999' where id = '00000000-0000-0000-0000-0000000ee002'$$)
  = 'LV001: an older version of the terms cannot replace a newer one', 'an invented earlier version is refused');
select test.logout();
select test.ok((select p.terms_version = '2026-02' and p.terms_accepted_at = b.terms_accepted_at from public.profiles p, ivo_before b
  where p.username = 'terms_ivo'), 'the version and its time are unchanged');

-- Versions are 1 to 40 characters (checked on a new profile: on an existing one, '' already sorts too early).
select test.logout();
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000ee006');
select test.login('00000000-0000-0000-0000-0000000ee006');
select test.ok(test.failure_of($$insert into public.profiles (id, username, terms_version, age_confirmed)
  values ('00000000-0000-0000-0000-0000000ee006', 'terms_mila', '', true)$$)
  like '23514: %profiles_terms_version_check%', 'an empty version is refused');
select test.ok(test.failure_of(format($$insert into public.profiles (id, username, terms_version, age_confirmed)
  values ('00000000-0000-0000-0000-0000000ee006', 'terms_mila', %L, true)$$, '2027-' || repeat('x', 36)))
  like '23514: %profiles_terms_version_check%', 'a version over 40 characters is refused');
select test.ok(test.failure_of(format($$insert into public.profiles (id, username, terms_version, age_confirmed)
  values ('00000000-0000-0000-0000-0000000ee006', 'terms_mila', %L, true)$$, '2027-' || repeat('x', 35))) is null,
  'a version of exactly 40 characters is fine');

select test.login('00000000-0000-0000-0000-0000000ee002');
-- Once given, neither the acceptance nor the age tick can be taken back.
select test.ok(test.failure_of($$update public.profiles set terms_version = null where id = '00000000-0000-0000-0000-0000000ee002'$$)
  = 'LV001: accepting the terms cannot be withdrawn: delete the account instead', 'the terms cannot be un-accepted');
select test.ok(test.failure_of($$update public.profiles set age_confirmed = false where id = '00000000-0000-0000-0000-0000000ee002'$$)
  = 'LV001: the age confirmation cannot be withdrawn', 'the age tick cannot be taken back');
select test.ok((select terms_version = '2026-02' and age_confirmed from public.my_profile()),
  'both are still there');

-- The terms are never accepted without the age tick, on insert or update.
select test.login('00000000-0000-0000-0000-0000000ee003');
select test.ok(test.failure_of($$insert into public.profiles (id, username, terms_version)
  values ('00000000-0000-0000-0000-0000000ee003', 'terms_jana', '2026-01')$$)
  = 'LV001: accepting the terms needs the age confirmation', 'a version without the age tick is refused');
select test.ok(not exists (select 1 from public.profiles where username = 'terms_jana'), 'and no profile was created');
select test.login('00000000-0000-0000-0000-0000000ee004');
insert into public.profiles (id, username) values ('00000000-0000-0000-0000-0000000ee004', 'terms_kalin');
select test.ok(test.failure_of($$update public.profiles set terms_version = '2026-01' where id = '00000000-0000-0000-0000-0000000ee004'$$)
  = 'LV001: accepting the terms needs the age confirmation', 'accepting later without the age tick is refused');

-- The age tick alone is allowed: it says nothing about the terms.
update public.profiles set age_confirmed = true where id = '00000000-0000-0000-0000-0000000ee004';
select test.ok((select age_confirmed and terms_accepted_at is null from public.my_profile()),
  'the age tick alone records no acceptance');

-- A backfill must set both together: even the database owner gets LV001 for a version alone.
select test.logout();
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000ee005');
insert into public.profiles (id, username) values ('00000000-0000-0000-0000-0000000ee005', 'terms_lora');
select test.ok(test.failure_of($$update public.profiles set terms_version = '2026-01' where id = '00000000-0000-0000-0000-0000000ee005'$$)
  = 'LV001: accepting the terms needs the age confirmation', 'a backfill of the version alone is refused');

\o
\echo 'TERMS ACCEPTANCE RULES PASSED'
