-- A "Want to read" book added without its chapter count: the first reader who has it sets it once.
-- Runs after spoiler_rules.test.sql (needs its test schema).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

select test.logout();
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000007c1'), ('00000000-0000-0000-0000-0000000007c2');
insert into public.profiles (id, username) values
  ('00000000-0000-0000-0000-0000000007c1', 'carla'), ('00000000-0000-0000-0000-0000000007c2', 'dino');

select test.login('00000000-0000-0000-0000-0000000007c1');
insert into public.stories (id, kind, language, title, author_name, has_chapters, total_sections, status)
  values ('00000000-0000-0000-0000-0000000007b1', 'book', 'en', 'Count Later', 'x', true, null, 'completed');
insert into public.library_entries (story_id, user_id, status)
  values ('00000000-0000-0000-0000-0000000007b1', '00000000-0000-0000-0000-0000000007c1', 'want_to_read');

-- Someone without the book in their library can't set it.
select test.login('00000000-0000-0000-0000-0000000007c2');
select test.ok(test.error_of($$select public.set_book_chapter_count('00000000-0000-0000-0000-0000000007b1', 12)$$) like 'cannot set%',
  'only a reader who has the book sets its chapter count');

select test.login('00000000-0000-0000-0000-0000000007c1');
select test.ok(test.error_of($$select public.set_book_chapter_count('00000000-0000-0000-0000-0000000007b1', 0)$$) like 'chapters must be%',
  'the count is 1 to 5000');
select test.ok(test.error_of($$select public.set_book_chapter_count('00000000-0000-0000-0000-0000000007b1', 12)$$) is null,
  'the first reader sets the count');
select test.ok((select total_sections from public.stories where id = '00000000-0000-0000-0000-0000000007b1') = 12, 'saved');
select test.ok(test.error_of($$select public.set_book_chapter_count('00000000-0000-0000-0000-0000000007b1', 40)$$) like 'cannot set%',
  'once set, it is not changed this way');

select test.logout();
\o
\echo 'BOOK CHAPTER COUNT PASSED'
