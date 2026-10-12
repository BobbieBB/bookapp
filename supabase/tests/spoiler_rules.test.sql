-- Spoiler Safe Mode + privacy tests. Run against a fresh database that has
-- auth_stub.sql and all migrations applied (see supabase/tests/run.sh).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

create schema test;
grant usage on schema test to authenticated, anon;

create function test.ok(cond boolean, name text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', name; end if;
  raise notice 'ok - %', name;
end $$;

-- runs `sql` and returns the error message, or null if it succeeded
create function test.error_of(sql text) returns text language plpgsql as $$
begin
  execute sql;
  return null;
exception when others then
  return sqlerrm;
end $$;
grant execute on all functions in schema test to authenticated, anon;

create function test.login(u uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u::text, false), set_config('role', 'authenticated', false);
$$;
create function test.logout() returns void language sql as $$
  select set_config('request.jwt.claim.sub', '', false), set_config('role', 'postgres', false);
$$;
grant execute on all functions in schema test to authenticated, anon;

-- Fixtures (as superuser) -----------------------------------------------------
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),  -- alice: on chapter 3
  ('00000000-0000-0000-0000-00000000000b'),  -- bob: finished
  ('00000000-0000-0000-0000-00000000000c'),  -- carol: on chapter 10, blocked by alice
  ('00000000-0000-0000-0000-00000000000d'),  -- dave: no library entry
  ('00000000-0000-0000-0000-0000000000ad');  -- admin
insert into public.profiles (id, username, is_admin) values
  ('00000000-0000-0000-0000-00000000000a', 'alice', false),
  ('00000000-0000-0000-0000-00000000000b', 'bob', false),
  ('00000000-0000-0000-0000-00000000000c', 'carol', false),
  ('00000000-0000-0000-0000-00000000000d', 'dave', false),
  ('00000000-0000-0000-0000-0000000000ad', 'admin', true);

insert into public.stories (id, kind, title, author_name, total_sections, status, created_by) values
  ('10000000-0000-0000-0000-000000000001', 'book', 'A Book', 'Some Author', 20, 'completed',
   '00000000-0000-0000-0000-00000000000a');
insert into public.stories (id, kind, title, author_name, published_sections, status, source, source_url, created_by) values
  ('10000000-0000-0000-0000-000000000002', 'fanfic', 'A WIP Fic', 'some_writer', 5, 'ongoing', 'ao3',
   'https://archiveofourown.org/works/1', '00000000-0000-0000-0000-00000000000a');
insert into public.stories (id, kind, title, author_name, has_chapters, page_count, created_by) values
  ('10000000-0000-0000-0000-000000000003', 'book', 'No Chapters', 'Someone', false, 110,
   '00000000-0000-0000-0000-00000000000a');

insert into public.library_entries (user_id, story_id, status, progress_section) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'currently_reading', 3),
  ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', 'finished', 0),
  ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001', 'currently_reading', 10);

-- 1. Chapter locks ------------------------------------------------------------
select test.login('00000000-0000-0000-0000-00000000000c');
select public.open_discussion('10000000-0000-0000-0000-000000000001', 'chapter', 10);
insert into public.comments (discussion_id, body)
  select id, 'Chapter 10 twist!!' from public.discussions where section_number = 10;
select public.open_discussion('10000000-0000-0000-0000-000000000001', 'chapter', 2);
insert into public.comments (id, discussion_id, body)
  select 'c0000000-0000-0000-0000-000000000002', id, 'carol on ch2' from public.discussions where section_number = 2;

select test.login('00000000-0000-0000-0000-00000000000a');
select test.ok(public.can_access_section('10000000-0000-0000-0000-000000000001', 'chapter', 3), 'alice can open chapter 3');
select test.ok(not public.can_access_section('10000000-0000-0000-0000-000000000001', 'chapter', 4), 'alice cannot open chapter 4');
select test.ok(test.error_of($$select public.open_discussion('10000000-0000-0000-0000-000000000001', 'chapter', 10)$$) like 'locked%',
  'open_discussion refuses a locked chapter');
select test.ok((select count(*) from public.comments where body like 'Chapter 10%') = 0, 'alice cannot read chapter 10 comments (direct query)');
select test.ok(test.error_of($$insert into public.comments (discussion_id, body)
  select id, 'sneaky' from public.discussions where section_number = 10$$) like '%row-level security%',
  'alice cannot post into chapter 10');
select test.ok(not public.can_access_section('10000000-0000-0000-0000-000000000001', 'epilogue', null), 'alice cannot enter The Epilogue');

-- 2. Finished readers ---------------------------------------------------------
select test.login('00000000-0000-0000-0000-00000000000b');
select test.ok((select progress_section from public.library_entries where user_id = auth.uid()
  and story_id = '10000000-0000-0000-0000-000000000001') = 20, 'Finished sets progress to the last chapter');
select test.ok((select count(*) from public.comments where body like 'Chapter 10%') = 1, 'bob (finished) reads chapter 10');
select public.open_discussion('10000000-0000-0000-0000-000000000001', 'epilogue');
select test.ok(test.error_of($$insert into public.comments (discussion_id, body)
  select id, 'that ending' from public.discussions where kind = 'epilogue'$$) is null, 'bob posts in The Epilogue');

-- 3. Moving progress back re-locks ------------------------------------------
select test.login('00000000-0000-0000-0000-00000000000c');
update public.library_entries set progress_section = 1 where story_id = '10000000-0000-0000-0000-000000000001';
select test.ok((select count(*) from public.comments where body like 'Chapter 10%') = 0, 'carol moved back: chapter 10 locked again (even her own comment)');
update public.library_entries set progress_section = 10 where story_id = '10000000-0000-0000-0000-000000000001';

-- 4. Progress cannot go past what exists ------------------------------------
select test.ok(test.error_of($$update public.library_entries set progress_section = 21
  where story_id = '10000000-0000-0000-0000-000000000001'$$) like 'progress%beyond%', 'progress capped at chapter count');

-- 5. Books without chapters: 25-page ranges ---------------------------------
select test.login('00000000-0000-0000-0000-00000000000d');
insert into public.library_entries (story_id, status, progress_page) values ('10000000-0000-0000-0000-000000000003', 'currently_reading', 60);
select test.ok((select progress_section from public.library_entries where story_id = '10000000-0000-0000-0000-000000000003') = 2,
  'page 60 → ranges 1–2 finished (pages 1–50)');
select test.ok(not public.can_access_section('10000000-0000-0000-0000-000000000003', 'chapter', 3), 'range 3 (pages 51–75) still locked');
update public.library_entries set progress_page = 110 where story_id = '10000000-0000-0000-0000-000000000003';
select test.ok((select progress_section from public.library_entries where story_id = '10000000-0000-0000-0000-000000000003') = 5,
  'last page → all 5 ranges (110 pages) finished');

-- 6. WIP fanfic: a new chapter stays locked even for "finished" readers -------
insert into public.library_entries (story_id, status) values ('10000000-0000-0000-0000-000000000002', 'finished');
select test.ok(public.can_access_section('10000000-0000-0000-0000-000000000002', 'chapter', 5), 'caught-up reader sees chapter 5');
select public.bump_published_sections('10000000-0000-0000-0000-000000000002', 6);
select test.ok(not public.can_access_section('10000000-0000-0000-0000-000000000002', 'chapter', 6), 'new WIP chapter 6 is locked until read');
select test.ok(test.error_of($$select public.bump_published_sections('10000000-0000-0000-0000-000000000002', 4)$$) is null
  and (select published_sections from public.stories where id = '10000000-0000-0000-0000-000000000002') = 6,
  'published chapter count never goes down');
select test.ok(test.error_of($$insert into public.library_entries (story_id, status) values ('10000000-0000-0000-0000-000000000001', 'on_hold')$$)
  like 'on_hold%', 'On hold is fanfic-only');

-- 7. Blocking ------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-00000000000a');
insert into public.blocks (blocked_id) values ('00000000-0000-0000-0000-00000000000c');
select test.ok((select count(*) from public.comments where body = 'carol on ch2') = 0, 'alice does not see blocked carol');
select test.ok(test.error_of($$insert into public.comments (discussion_id, parent_id, body)
  select id, 'c0000000-0000-0000-0000-000000000002', 'reply' from public.discussions where section_number = 2$$) like '%row-level security%', 'cannot reply across a block');

select test.login('00000000-0000-0000-0000-00000000000b');
insert into public.comments (discussion_id, parent_id, body)
  select discussion_id, id, 'bob replies' from public.comments where body = 'carol on ch2';
select test.login('00000000-0000-0000-0000-00000000000c');
select test.ok((select count(*) from public.notifications where type = 'reply') = 1, 'carol gets a reply notification');
select test.ok(test.error_of($$update public.comments set is_hidden = true where body = 'carol on ch2'$$) like 'only moderators%',
  'authors cannot un/hide via is_hidden');

-- 8. Ratings: books public, fanfic private -----------------------------------
select test.login('00000000-0000-0000-0000-00000000000b');
insert into public.ratings (story_id, rating) values ('10000000-0000-0000-0000-000000000001', 4.5);
insert into public.library_entries (story_id, status, progress_section) values ('10000000-0000-0000-0000-000000000002', 'currently_reading', 2);
insert into public.ratings (story_id, rating) values ('10000000-0000-0000-0000-000000000002', 2);
select test.ok(test.error_of($$insert into public.ratings (story_id, rating) values ('10000000-0000-0000-0000-000000000003', 3.3)$$) is not null,
  'only half-star steps');
select test.login('00000000-0000-0000-0000-00000000000a');
select test.ok((select count(*) from public.ratings where story_id = '10000000-0000-0000-0000-000000000001') = 1, 'book ratings are public');
select test.ok((select count(*) from public.ratings where story_id = '10000000-0000-0000-0000-000000000002') = 0, 'fic ratings are private');
select test.ok((select average_rating from public.book_rating_stats where story_id = '10000000-0000-0000-0000-000000000001') = 4.5, 'book average');

-- 9. Privilege escalation & anonymous access ---------------------------------
select test.ok(test.error_of($$update public.profiles set is_admin = true where id = auth.uid()$$) like '%permission denied%',
  'users cannot make themselves admin');
select test.ok(test.error_of($$insert into public.discussions (story_id, kind, section_number) values ('10000000-0000-0000-0000-000000000001', 'chapter', 15)$$)
  like '%row-level security%', 'discussions can only be created via open_discussion');
select test.logout();
select set_config('role', 'anon', false);
select test.ok(test.error_of('select * from public.stories') like '%permission denied%', 'anon cannot read stories');
select test.ok(test.error_of('select * from public.comments') like '%permission denied%', 'anon cannot read comments');
select test.logout();

-- 10. Admin & author opt-out -------------------------------------------------
select test.login('00000000-0000-0000-0000-0000000000ad');
update public.stories set is_hidden = true where id = '10000000-0000-0000-0000-000000000002';
select test.login('00000000-0000-0000-0000-00000000000d');
select test.ok(not exists (select 1 from public.stories where id = '10000000-0000-0000-0000-000000000002'
  and created_by <> auth.uid()), 'hidden (opted-out) fic disappears for readers');
select test.ok(not public.can_access_section('10000000-0000-0000-0000-000000000002', 'chapter', 1), 'hidden fic discussions are closed');
select test.logout();

\o
\echo 'ALL TESTS PASSED'
