-- A reader's library is private by default (docs/DECISIONS.md, "Library: private by default"): another
-- signed-in reader cannot read it, the owner still can. Runs after spoiler_rules.test.sql (needs its test schema).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

select test.logout();
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000ab001'), ('00000000-0000-0000-0000-0000000ab002');
insert into public.profiles (id, username) values
  ('00000000-0000-0000-0000-0000000ab001', 'private_pia'), ('00000000-0000-0000-0000-0000000ab002', 'private_rui');
insert into public.stories (id, kind, title, author_name, language, published_sections, total_sections, status, source)
  values ('ab500000-0000-0000-0000-000000000001', 'book', 'A quiet book', 'Someone', 'en', 10, 10, 'completed', 'manual');

select test.login('00000000-0000-0000-0000-0000000ab001');
insert into public.library_entries (user_id, story_id, status) values
  ('00000000-0000-0000-0000-0000000ab001', 'ab500000-0000-0000-0000-000000000001', 'currently_reading');
select test.ok((select visibility = 'private' from public.library_entries where user_id = '00000000-0000-0000-0000-0000000ab001'),
  'a new library entry is private');
select test.ok((select count(*) = 1 from public.library_entries where story_id = 'ab500000-0000-0000-0000-000000000001'),
  'the owner sees their own entry');

select test.login('00000000-0000-0000-0000-0000000ab002');
select test.ok((select count(*) = 0 from public.library_entries where user_id = '00000000-0000-0000-0000-0000000ab001'),
  'another reader cannot read it');

select test.logout();
\o
\echo 'PRIVATE LIBRARY RULES PASSED'
