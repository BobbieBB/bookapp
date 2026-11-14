-- Another signed-in reader sees only the public part of a profile (privacy policy, "Profile": Name, what
-- you read, favourite genres and fandoms, join date); the admin and suspension flags and the terms
-- acceptance stay with the owner, who reads them through my_profile(). Library entries are readable only
-- by their owner and cannot be made public. Runs after spoiler_rules.test.sql (needs its test schema).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

select test.logout();
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000fa001'), ('00000000-0000-0000-0000-0000000fa002');
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

-- Library entries are only ever private.
insert into public.library_entries (user_id, story_id, status) values
  ('00000000-0000-0000-0000-0000000fa001', 'fa500000-0000-0000-0000-000000000001', 'currently_reading');
select test.ok(test.error_of($q$update public.library_entries set visibility = 'public' where user_id = auth.uid()$q$) is not null,
  'the owner cannot make a library entry public');
select test.ok(test.error_of($q$insert into public.library_entries (user_id, story_id, status, visibility)
  values (auth.uid(), 'fa500000-0000-0000-0000-000000000001', 'finished', 'friends')
  on conflict do nothing$q$) is not null, 'nor add one that is not private');
select test.logout();
select test.ok(test.error_of($q$update public.library_entries set visibility = 'public'
  where user_id = '00000000-0000-0000-0000-0000000fa001'$q$) is not null, 'not even the database owner');
-- The read policy keeps entries private on its own, not only through the constraint: lift the rule,
-- mark Ada's entry public, and Bo still cannot read it.
alter table public.library_entries drop constraint library_entries_private;
update public.library_entries set visibility = 'public' where user_id = '00000000-0000-0000-0000-0000000fa001';
select test.login('00000000-0000-0000-0000-0000000fa002');
select test.ok((select count(*) = 0 from public.library_entries where user_id = '00000000-0000-0000-0000-0000000fa001'),
  'another reader cannot read a library entry, even one marked public');
select test.logout();
update public.library_entries set visibility = 'private' where user_id = '00000000-0000-0000-0000-0000000fa001';
alter table public.library_entries add constraint library_entries_private check (visibility = 'private');

select test.logout();
\o
\echo 'PROFILE PRIVACY RULES PASSED'
