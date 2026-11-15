-- Another signed-in reader sees only the public part of a profile (privacy policy, "Profile": Name, what
-- you read, favourite genres and fandoms, join date); the admin and suspension flags and the terms
-- acceptance stay with the owner, who reads them through my_profile(). Library entries are readable only
-- by their owner and cannot be made public. Runs after spoiler_rules.test.sql (needs its test schema).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

select test.logout();
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000fa001'), ('00000000-0000-0000-0000-0000000fa002'),
  ('00000000-0000-0000-0000-0000000fa003');
insert into public.profiles (id, username, display_name, reads_fanfic, favourite_genres, favourite_fandoms,
                             is_admin, terms_version, age_confirmed) values
  ('00000000-0000-0000-0000-0000000fa001', 'privy_ada', 'Ada', true, '{fantasy}', '{Fandom A}', true, '2026-01', true),
  ('00000000-0000-0000-0000-0000000fa002', 'privy_bo', null, false, '{}', '{}', false, '2026-01', true);
insert into public.stories (id, kind, title, author_name, language, published_sections, total_sections, status, source)
  values ('fa500000-0000-0000-0000-000000000001', 'book', 'A private book', 'Someone', 'en', 10, 10, 'completed', 'manual');

-- Bo reads Ada's profile.
select test.login('00000000-0000-0000-0000-0000000fa002');
select test.ok(
  (select username = 'privy_ada' and display_name = 'Ada' and reads_books and reads_fanfic
          and favourite_genres = '{fantasy}' and favourite_fandoms = '{Fandom A}' and created_at is not null
     from public.profiles where id = '00000000-0000-0000-0000-0000000fa001'),
  'another reader reads the public profile columns');
select test.ok(test.error_of($q$select is_admin from public.profiles where id = '00000000-0000-0000-0000-0000000fa001'$q$)
  like 'permission denied%', 'another reader cannot read the admin flag');
select test.ok(test.error_of($q$select is_suspended from public.profiles where id = '00000000-0000-0000-0000-0000000fa001'$q$)
  like 'permission denied%', 'another reader cannot read the suspension flag');
select test.ok(test.error_of($q$select terms_version from public.profiles where id = '00000000-0000-0000-0000-0000000fa001'$q$)
  like 'permission denied%', 'another reader cannot read the terms version');
select test.ok(test.error_of($q$select terms_accepted_at from public.profiles where id = '00000000-0000-0000-0000-0000000fa001'$q$)
  like 'permission denied%', 'another reader cannot read the acceptance time');
select test.ok(test.error_of($q$select age_confirmed from public.profiles where id = '00000000-0000-0000-0000-0000000fa001'$q$)
  like 'permission denied%', 'another reader cannot read the age tick');
select test.ok(test.error_of($q$select * from public.profiles$q$) like 'permission denied%',
  'select * on profiles is refused: every query names its columns');
select test.ok((select count(*) = 1 from public.my_profile()), 'my_profile() returns only the caller''s row');
select test.ok((select id = '00000000-0000-0000-0000-0000000fa002' and not is_admin from public.my_profile()),
  'my_profile() is the caller''s own row, never another reader''s');

-- A signed-in reader without a profile yet (before onboarding) gets no row, not an error.
select test.login('00000000-0000-0000-0000-0000000fa003');
select test.ok((select count(*) = 0 from public.my_profile()), 'my_profile() returns no row before onboarding');

-- Signed out, my_profile() is not callable at all.
select test.logout();
set role anon;
select test.ok(test.error_of($q$select * from public.my_profile()$q$) like 'permission denied for function my_profile',
  'anon cannot call my_profile()');
reset role;

-- The grant is the exact public allowlist: granting a hidden column, or a new column by accident, fails here.
select test.ok(
  (select array_agg(column_name::text order by column_name)
     from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'profiles' and grantee = 'authenticated' and privilege_type = 'SELECT')
  = array['avatar_url', 'created_at', 'display_name', 'favourite_fandoms', 'favourite_genres', 'id', 'reads_books',
          'reads_fanfic', 'username'],
  'signed-in readers can select exactly the public profile columns');
select test.ok(
  not exists (select from information_schema.column_privileges
               where table_schema = 'public' and table_name = 'profiles' and grantee = 'anon' and privilege_type = 'SELECT'),
  'anon can select no profile column');

-- Ada reads her own full row.
select test.login('00000000-0000-0000-0000-0000000fa001');
select test.ok(
  (select is_admin and not is_suspended and terms_version = '2026-01' and terms_accepted_at is not null and age_confirmed
     from public.my_profile()),
  'the owner reads every own column through my_profile()');
select test.ok(public.is_admin(), 'is_admin() still sees the flag');
select test.ok(public.is_active_user(), 'is_active_user() still sees the suspension flag');
select test.ok(test.error_of($q$update public.profiles set reads_books = false where id = auth.uid()$q$) is null,
  'the owner still updates her profile');
select test.ok(test.error_of($q$update public.profiles set reads_books = true where id = auth.uid() returning is_admin$q$)
  like 'permission denied%', 'an update of her own row cannot return a hidden column');
select test.ok(test.error_of($q$update public.profiles set reads_books = true where id = auth.uid() returning username$q$) is null,
  'an update of her own row may return public columns');

-- Library entries are only ever private.
insert into public.library_entries (user_id, story_id, status) values
  ('00000000-0000-0000-0000-0000000fa001', 'fa500000-0000-0000-0000-000000000001', 'currently_reading');
select test.ok(test.error_of($q$update public.library_entries set visibility = 'public' where user_id = auth.uid()$q$)
  like '%violates check constraint "library_entries_private"%', 'the owner cannot make a library entry public');
select test.ok(test.error_of($q$insert into public.library_entries (user_id, story_id, status, visibility)
  values (auth.uid(), 'fa500000-0000-0000-0000-000000000001', 'finished', 'friends')
  on conflict do nothing$q$) like '%violates check constraint "library_entries_private"%', 'nor add one that is not private');
select test.logout();
select test.ok(test.error_of($q$update public.library_entries set visibility = 'public'
  where user_id = '00000000-0000-0000-0000-0000000fa001'$q$) like '%violates check constraint "library_entries_private"%',
  'not even the database owner');
-- The read policy keeps entries private on its own, not only through the constraint: lift the rule,
-- mark Ada's entry public, and Bo still cannot read it. All in one transaction that is rolled back, so the
-- constraint is never missing outside it, even if an assertion fails (psql stops; the open transaction aborts).
begin;
alter table public.library_entries drop constraint library_entries_private;
update public.library_entries set visibility = 'public' where user_id = '00000000-0000-0000-0000-0000000fa001';
select test.login('00000000-0000-0000-0000-0000000fa002');
select test.ok((select count(*) = 0 from public.library_entries where user_id = '00000000-0000-0000-0000-0000000fa001'),
  'another reader cannot read a library entry, even one marked public');
rollback;
select test.ok(exists (select from pg_constraint where conname = 'library_entries_private'
                        and conrelid = 'public.library_entries'::regclass),
  'the rollback restores the constraint');

select test.logout();
\o
\echo 'PROFILE PRIVACY RULES PASSED'
