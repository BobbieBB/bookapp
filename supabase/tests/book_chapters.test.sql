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

-- The key case: a SECOND reader has the book. stories_guard_update would block a plain update by
-- carla (she isn't its creator), which is why the function is security definer.
select test.logout();
insert into public.stories (id, kind, language, title, author_name, has_chapters, total_sections, status)
  values ('00000000-0000-0000-0000-0000000007b2', 'book', 'en', 'Shared Count Later', 'x', true, null, 'completed');
select test.login('00000000-0000-0000-0000-0000000007c2');
insert into public.library_entries (story_id, user_id, status)
  values ('00000000-0000-0000-0000-0000000007b2', '00000000-0000-0000-0000-0000000007c2', 'want_to_read');
select test.login('00000000-0000-0000-0000-0000000007c1');
insert into public.library_entries (story_id, user_id, status)
  values ('00000000-0000-0000-0000-0000000007b2', '00000000-0000-0000-0000-0000000007c1', 'want_to_read');
select test.ok(test.error_of($$select public.set_book_chapter_count('00000000-0000-0000-0000-0000000007b2', 5001)$$) like 'chapters must be%',
  'the count is at most 5000');
select test.ok(test.error_of($$select public.set_book_chapter_count('00000000-0000-0000-0000-0000000007b2', 9)$$) is null,
  'a reader sets the count of a book someone else also has');
select test.ok((select total_sections from public.stories where id = '00000000-0000-0000-0000-0000000007b2') = 9,
  'and it is saved for everyone');

-- Only books: a fic and a hidden book are refused even for a reader who has them.
select test.logout();
insert into public.stories (id, kind, language, title, author_name, has_chapters, total_sections, status, source_url)
  values ('00000000-0000-0000-0000-0000000007b3', 'fanfic', 'en', 'A Fic', 'x', true, null, 'ongoing', 'https://archiveofourown.org/works/7071');
insert into public.stories (id, kind, language, title, author_name, has_chapters, total_sections, status, is_hidden)
  values ('00000000-0000-0000-0000-0000000007b4', 'book', 'en', 'Hidden Book', 'x', true, null, 'completed', true);
insert into public.library_entries (story_id, user_id, status) values
  ('00000000-0000-0000-0000-0000000007b3', '00000000-0000-0000-0000-0000000007c1', 'want_to_read'),
  ('00000000-0000-0000-0000-0000000007b4', '00000000-0000-0000-0000-0000000007c1', 'want_to_read');
select test.login('00000000-0000-0000-0000-0000000007c1');
select test.ok(test.error_of($$select public.set_book_chapter_count('00000000-0000-0000-0000-0000000007b3', 9)$$) like 'cannot set%',
  'a fic has no book chapter count to set');
select test.ok(test.error_of($$select public.set_book_chapter_count('00000000-0000-0000-0000-0000000007b4', 9)$$) like 'cannot set%',
  'a hidden book is refused');

select test.logout();
\o
\echo 'BOOK CHAPTER COUNT PASSED'
