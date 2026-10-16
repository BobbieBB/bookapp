-- Private custom covers: the path always points into the reader's own folder.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

select test.logout();
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000c01'), ('00000000-0000-0000-0000-000000000c02');
insert into public.profiles (id, username) values ('00000000-0000-0000-0000-000000000c01', 'cora'), ('00000000-0000-0000-0000-000000000c02', 'cleo');
insert into public.stories (id, kind, language, title, author_name, total_sections, status) values
  ('c0000000-0000-0000-0000-00000000c001', 'book', 'en', 'Covered', 'x', 3, 'completed');
insert into public.library_entries (user_id, story_id, status) values
  ('00000000-0000-0000-0000-000000000c01', 'c0000000-0000-0000-0000-00000000c001', 'want_to_read'),
  ('00000000-0000-0000-0000-000000000c02', 'c0000000-0000-0000-0000-00000000c001', 'want_to_read');

select test.login('00000000-0000-0000-0000-000000000c01');
select test.ok(test.error_of($$insert into public.custom_covers (story_id, path)
  values ('c0000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-000000000c02/theirs.jpg')$$) like '%check%', 'not someone else''s file');
select test.ok(test.error_of($$insert into public.custom_covers (story_id, path)
  values ('c0000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-000000000c01/../x.jpg')$$) like '%check%', 'no climbing out of your folder');
select test.ok(test.error_of($$insert into public.custom_covers (story_id, path)
  values ('c0000000-0000-0000-0000-00000000c099', '00000000-0000-0000-0000-000000000c01/x.jpg')$$) is not null, 'only for a story in your library');
insert into public.custom_covers (story_id, path) values ('c0000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-000000000c01/c1.jpg');

select test.login('00000000-0000-0000-0000-000000000c02');
select test.ok((select count(*) from public.custom_covers) = 0, 'other readers never see your cover');
select test.ok(test.error_of($$insert into public.custom_covers (user_id, story_id, path)
  values ('00000000-0000-0000-0000-000000000c01', 'c0000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-000000000c01/evil.jpg')$$)
  like '%row-level security%', 'nor set one for you');

select test.login('00000000-0000-0000-0000-000000000c01');
delete from public.library_entries where user_id = auth.uid();
select test.ok((select count(*) from public.custom_covers) = 0, 'removing the story from your library removes its cover choice');

select test.logout();
\o
\echo 'COVER RULES PASSED'
