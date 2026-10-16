-- The story page's list of rooms: one per chapter plus The Epilogue, with lock state and counts
-- (docs/DECISIONS.md, Spoiler Safe Mode). Runs after spoiler_rules.test.sql (needs its test schema).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

select test.logout();
create function test.room(p_kind public.discussion_kind, p_section int)
returns table (unlocked boolean, readers bigint, comments bigint) language plpgsql as $$
begin
  return query select r.unlocked, r.readers, r.comments from public.story_rooms('d5000000-0000-0000-0000-000000000001') r
    where r.kind = p_kind and r.section_number is not distinct from p_section;
end $$;
grant execute on function test.room to authenticated;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000d01'), ('00000000-0000-0000-0000-000000000d02'),
  ('00000000-0000-0000-0000-000000000d03'), ('00000000-0000-0000-0000-000000000d04');
insert into public.profiles (id, username) values
  ('00000000-0000-0000-0000-000000000d01', 'dina'),   -- finished chapter 2
  ('00000000-0000-0000-0000-000000000d02', 'dimo'),   -- finished the book
  ('00000000-0000-0000-0000-000000000d03', 'desi'),   -- finished chapter 4, comments a lot
  ('00000000-0000-0000-0000-000000000d04', 'dani');   -- not reading it
insert into public.stories (id, kind, language, title, author_name, total_sections, status) values
  ('d5000000-0000-0000-0000-000000000001', 'book', 'en', 'Four Chapters', 'x', 4, 'completed');
insert into public.library_entries (user_id, story_id, status, progress_section) values
  ('00000000-0000-0000-0000-000000000d01', 'd5000000-0000-0000-0000-000000000001', 'currently_reading', 2),
  ('00000000-0000-0000-0000-000000000d02', 'd5000000-0000-0000-0000-000000000001', 'finished', 0),
  ('00000000-0000-0000-0000-000000000d03', 'd5000000-0000-0000-0000-000000000001', 'currently_reading', 4);

select test.login('00000000-0000-0000-0000-000000000d03');
select public.open_discussion('d5000000-0000-0000-0000-000000000001', 'chapter', 1);
select public.open_discussion('d5000000-0000-0000-0000-000000000001', 'chapter', 3);
insert into public.comments (discussion_id, body)
  select id, b from public.discussions, (values ('one'), ('two'), ('gone')) v(b)
  where story_id = 'd5000000-0000-0000-0000-000000000001' and section_number = 1;
update public.comments set deleted_at = now() where body = 'gone' and author_id = auth.uid();
insert into public.comments (discussion_id, body)
  select id, 'ch3 twist' from public.discussions where story_id = 'd5000000-0000-0000-0000-000000000001' and section_number = 3;


select test.login('00000000-0000-0000-0000-000000000d01');
select test.ok((select count(*) from public.story_rooms('d5000000-0000-0000-0000-000000000001')) = 5,
  'one room per chapter plus The Epilogue');
select test.ok((select unlocked and comments = 2 from test.room('chapter', 1)), 'an unlocked chapter shows its comment count (deleted ones not counted)');
select test.ok((select readers from test.room('chapter', 2)) = 3, 'readers who finished chapter 2 (finished readers included)');
select test.ok((select not unlocked and comments is null from test.room('chapter', 3)), 'a locked chapter shows no comment count');
select test.ok((select readers from test.room('chapter', 3)) = 2, 'a locked chapter still shows how many readers are there');
select test.ok((select not unlocked from test.room('epilogue', null)), 'The Epilogue is locked until you finish');
select test.ok((select readers from test.room('epilogue', null)) = 1, 'readers who finished the story');

select test.login('00000000-0000-0000-0000-000000000d02');
select test.ok((select bool_and(unlocked) from public.story_rooms('d5000000-0000-0000-0000-000000000001')), 'a finished reader can open every room');

-- Blocking: the blocker no longer counts the blocked reader's comments.
select test.login('00000000-0000-0000-0000-000000000d01');
insert into public.blocks (blocked_id) values ('00000000-0000-0000-0000-000000000d03');
select test.ok((select comments from test.room('chapter', 1)) = 0, 'comments by people you blocked are not counted');

select test.login('00000000-0000-0000-0000-000000000d04');
select test.ok((select bool_and(not unlocked) and bool_and(comments is null) from public.story_rooms('d5000000-0000-0000-0000-000000000001')),
  'a reader without the story sees every room locked');

-- On a WIP fic, "Finished" readers are only counted where they can actually go.
select test.logout();
insert into public.stories (id, kind, title, author_name, published_sections, status, source, source_url) values
  ('d5000000-0000-0000-0000-000000000002', 'fanfic', 'Still Going', 'w', 3, 'ongoing', 'ao3', 'https://archiveofourown.org/works/8801');
insert into public.library_entries (user_id, story_id, status, progress_section) values
  ('00000000-0000-0000-0000-000000000d02', 'd5000000-0000-0000-0000-000000000002', 'finished', 3);
update public.stories set published_sections = 4 where id = 'd5000000-0000-0000-0000-000000000002'; -- a new chapter came out
select test.login('00000000-0000-0000-0000-000000000d02');
select test.ok((select readers from public.story_rooms('d5000000-0000-0000-0000-000000000002') where kind = 'chapter' and section_number = 4) = 0,
  'a "finished" reader of a WIP is not counted in a chapter published after they finished');
select test.ok((select readers from public.story_rooms('d5000000-0000-0000-0000-000000000002') where kind = 'epilogue') = 0,
  'nobody is counted in the Epilogue of a story that is still ongoing');

select test.logout();
update public.stories set is_hidden = true where id = 'd5000000-0000-0000-0000-000000000001';
select test.login('00000000-0000-0000-0000-000000000d02');
select test.ok((select count(*) from public.story_rooms('d5000000-0000-0000-0000-000000000001')) = 0, 'a hidden story has no rooms');

select test.logout();
select test.ok(test.error_of($$set role anon; select * from public.story_rooms('d5000000-0000-0000-0000-000000000001')$$) is not null,
  'signed-out visitors cannot list rooms');
reset role;
\o
\echo 'DISCUSSION RULES PASSED'
