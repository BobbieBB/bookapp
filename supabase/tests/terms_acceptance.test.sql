-- Accepting the terms and confirming your age (docs/DECISIONS.md, "Terms and age: ticked at sign-up"):
-- the server stamps when the terms were accepted, the reader can neither backdate nor withdraw it,
-- and the terms are never accepted without the age tick. Runs after spoiler_rules.test.sql (needs its
-- test schema).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

select test.logout();
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000ee001'), ('00000000-0000-0000-0000-0000000ee002'),
  ('00000000-0000-0000-0000-0000000ee003'), ('00000000-0000-0000-0000-0000000ee004');

-- Hana signs up today, but her phone claims she accepted in 2000.
select test.login('00000000-0000-0000-0000-0000000ee001');
insert into public.profiles (id, username, terms_version, age_confirmed, terms_accepted_at)
  values ('00000000-0000-0000-0000-0000000ee001', 'terms_hana', 'v1', true, '2000-01-01');
select test.ok((select terms_accepted_at > now() - interval '1 minute' from public.profiles where username = 'terms_hana'),
  'the server stamps the acceptance on insert, ignoring the time the app sent');

-- Ivo signed up before the terms existed.
select test.login('00000000-0000-0000-0000-0000000ee002');
insert into public.profiles (id, username, terms_accepted_at)
  values ('00000000-0000-0000-0000-0000000ee002', 'terms_ivo', '2000-01-01');
select test.ok((select terms_version is null and terms_accepted_at is null and not age_confirmed
  from public.profiles where username = 'terms_ivo'), 'without terms there is no acceptance time and no age tick');

-- Accepting later stamps the time on update.
update public.profiles set terms_version = 'v1', age_confirmed = true where id = '00000000-0000-0000-0000-0000000ee002';
select test.ok((select terms_version = 'v1' and age_confirmed and terms_accepted_at > now() - interval '1 minute'
  from public.profiles where username = 'terms_ivo'), 'accepting on update stamps the time');

-- The app cannot move the time itself.
select test.ok(test.error_of($$update public.profiles set terms_accepted_at = '2000-01-01'
  where id = '00000000-0000-0000-0000-0000000ee002'$$) is not null, 'a reader cannot set the acceptance time');
select test.ok((select terms_accepted_at > now() - interval '1 minute' from public.profiles where username = 'terms_ivo'),
  'the acceptance time is unchanged');

-- An unrelated edit keeps the time, even from the database owner; a new version stamps a new one.
select test.logout();
create temp table ivo_before as select terms_accepted_at from public.profiles where username = 'terms_ivo';
update public.profiles set terms_accepted_at = '2020-01-01' where id = '00000000-0000-0000-0000-0000000ee002';
select test.ok((select p.terms_accepted_at = b.terms_accepted_at from public.profiles p, ivo_before b where p.username = 'terms_ivo'),
  'nobody can move the time without a new version');
select test.login('00000000-0000-0000-0000-0000000ee002');
update public.profiles set reads_fanfic = true, favourite_genres = '{fantasy}' where id = '00000000-0000-0000-0000-0000000ee002';
select test.logout();
select test.ok((select p.terms_accepted_at = b.terms_accepted_at and p.reads_fanfic from public.profiles p, ivo_before b where p.username = 'terms_ivo'),
  'an unrelated profile edit leaves the acceptance time alone');
select test.login('00000000-0000-0000-0000-0000000ee002');
update public.profiles set terms_version = 'v2' where id = '00000000-0000-0000-0000-0000000ee002';
select test.logout();
select test.ok((select p.terms_version = 'v2' and p.terms_accepted_at > b.terms_accepted_at from public.profiles p, ivo_before b where p.username = 'terms_ivo'),
  'accepting a new version stamps a new time');

-- Once given, neither the acceptance nor the age tick can be taken back.
select test.login('00000000-0000-0000-0000-0000000ee002');
select test.ok(test.error_of($$update public.profiles set terms_version = null where id = '00000000-0000-0000-0000-0000000ee002'$$)
  like '%cannot be withdrawn%', 'the terms cannot be un-accepted');
select test.ok(test.error_of($$update public.profiles set age_confirmed = false where id = '00000000-0000-0000-0000-0000000ee002'$$)
  like '%cannot be withdrawn%', 'the age tick cannot be taken back');
select test.ok((select terms_version = 'v2' and age_confirmed from public.profiles where username = 'terms_ivo'),
  'both are still there');

-- The terms are never accepted without the age tick, on insert or update.
select test.login('00000000-0000-0000-0000-0000000ee003');
select test.ok(test.error_of($$insert into public.profiles (id, username, terms_version)
  values ('00000000-0000-0000-0000-0000000ee003', 'terms_jana', 'v1')$$) like '%age%', 'a version without the age tick is refused');
select test.ok(not exists (select 1 from public.profiles where username = 'terms_jana'), 'and no profile was created');
select test.login('00000000-0000-0000-0000-0000000ee004');
insert into public.profiles (id, username) values ('00000000-0000-0000-0000-0000000ee004', 'terms_kalin');
select test.ok(test.error_of($$update public.profiles set terms_version = 'v1' where id = '00000000-0000-0000-0000-0000000ee004'$$)
  like '%age%', 'accepting later without the age tick is refused');

-- The age tick alone is allowed (it says nothing about the terms), and a refused error has its own code.
update public.profiles set age_confirmed = true where id = '00000000-0000-0000-0000-0000000ee004';
select test.ok((select age_confirmed and terms_accepted_at is null from public.profiles where username = 'terms_kalin'),
  'the age tick alone records no acceptance');
select test.logout();
create function test.state_of(sql text) returns text language plpgsql as $$
begin
  execute sql;
  return null;
exception when others then
  return sqlstate;
end $$;
grant execute on function test.state_of(text) to authenticated;
select test.login('00000000-0000-0000-0000-0000000ee002');
select test.ok(test.state_of($$update public.profiles set terms_version = null where id = '00000000-0000-0000-0000-0000000ee002'$$) = 'LV001',
  'the refusal has its own SQLSTATE');

select test.logout();
\o
\echo 'TERMS ACCEPTANCE RULES PASSED'
