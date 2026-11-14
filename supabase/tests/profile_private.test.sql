-- A profile's private columns (terms acceptance, age tick, admin, suspended) can't be read by other readers,
-- or through the API at all; each reader reads their own through my_profile_private().
-- Runs after terms_acceptance.test.sql (needs its test.failure_of).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

select test.logout();
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000fe001'), ('00000000-0000-0000-0000-0000000fe002');
insert into public.profiles (id, username, terms_version, age_confirmed, is_admin) values
  ('00000000-0000-0000-0000-0000000fe001', 'private_pavla', '2026-11', true, true),
  ('00000000-0000-0000-0000-0000000fe002', 'nosy_nia', '2026-11', true, false);

select test.login('00000000-0000-0000-0000-0000000fe002');
select test.ok((select username = 'private_pavla' from public.profiles where id = '00000000-0000-0000-0000-0000000fe001'),
  'another reader still sees the public part of a profile');
select test.ok(test.failure_of($$select terms_accepted_at from public.profiles where username = 'private_pavla'$$) like '42501:%',
  'another reader cannot read when someone accepted the terms');
select test.ok(test.failure_of($$select is_admin from public.profiles where username = 'private_pavla'$$) like '42501:%',
  'another reader cannot read whether someone is an admin');
select test.ok(test.failure_of($$select age_confirmed from public.profiles where username = 'nosy_nia'$$) like '42501:%',
  'not even their own private columns through the table');
select test.ok((select terms_version = '2026-11' and age_confirmed and not is_admin and terms_accepted_at is not null
                from public.my_profile_private()),
  'a reader reads their own private fields through my_profile_private()');

select test.login('00000000-0000-0000-0000-0000000fe001');
select test.ok((select is_admin from public.my_profile_private()), 'and only their own');
select test.logout();

\o
\echo 'profile_private: ok'
