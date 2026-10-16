-- Story metadata and book-only ratings (docs/DECISIONS.md: language rooms, fic details in v1,
-- no ratings or recs for fanfiction). Runs after spoiler_rules.test.sql (needs its test schema).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

select test.logout();
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000005a1');
insert into public.profiles (id, username) values ('00000000-0000-0000-0000-0000000005a1', 'sally');
select test.login('00000000-0000-0000-0000-0000000005a1');

-- 1. Edition language ------------------------------------------------------------
select test.ok(test.error_of($$insert into public.stories (kind, title, author_name, total_sections, status)
  values ('book', 'No language', 'x', 3, 'completed')$$) like '%books_have_language%',
  'a book needs its edition language');
select test.ok(test.error_of($$insert into public.stories (kind, language, title, author_name, total_sections, status)
  values ('book', 'fr', 'French', 'x', 3, 'completed')$$) like '%language_supported%',
  'only English and Bulgarian editions for now');
select test.ok(test.error_of($$insert into public.stories (kind, language, title, author_name, total_sections, status, source, source_id)
  values ('book', 'bg', 'Mismatch', 'x', 3, 'completed', 'open_library', '/works/OL1W#en')$$) like '%open_library_edition_id%',
  'an Open Library story id names its edition language');
select test.ok(test.error_of($$insert into public.stories (kind, language, title, author_name, total_sections, status, source, source_id)
  values ('book', 'bg', 'Под игото', 'Иван Вазов', 30, 'completed', 'open_library', '/works/OL2W#bg')$$) is null,
  'a Bulgarian edition of an Open Library work');
select test.ok(test.error_of($$insert into public.stories (kind, title, author_name, published_sections, status, source, source_url)
  values ('fanfic', 'A fic', 'w', 1, 'ongoing', 'ao3', 'https://archiveofourown.org/works/5001')$$) is null,
  'fics need no language: AO3 translations are separate works');

-- 2. Fic details are AO3's fixed choices -------------------------------------------
select test.ok(test.error_of($$insert into public.stories (kind, title, author_name, published_sections, status, source, source_url, warnings)
  values ('fanfic', 'Bad warning', 'w', 1, 'ongoing', 'ao3', 'https://archiveofourown.org/works/5002', '{"Spiders"}')$$) like '%ao3_warnings%',
  'warnings are AO3 archive warnings only');
select test.ok(test.error_of($$insert into public.stories (kind, title, author_name, published_sections, status, source, source_url, content_rating)
  values ('fanfic', 'Bad rating', 'w', 1, 'ongoing', 'ao3', 'https://archiveofourown.org/works/5003', 'PG-13')$$) like '%ao3_rating%',
  'ratings are AO3 ratings only');
select test.ok(test.error_of($$insert into public.stories (kind, title, author_name, published_sections, status, source, source_url, content_rating, warnings)
  values ('fanfic', 'Good', 'w', 1, 'ongoing', 'ao3', 'https://archiveofourown.org/works/5004', 'Mature',
          '{"Graphic Depictions Of Violence","Major Character Death"}')$$) is null,
  'AO3 rating and warnings are accepted');

-- 3. Ratings and reviews are for books only -------------------------------------
select test.ok(test.error_of($$insert into public.ratings (story_id, rating)
  select id, 4 from public.stories where source_url = 'https://archiveofourown.org/works/5004'$$) like '%row-level security%',
  'fanfiction cannot be rated, not even privately');
select test.ok(test.error_of($$insert into public.reviews (story_id, body)
  select id, 'A rec' from public.stories where source_url = 'https://archiveofourown.org/works/5004'$$) like '%row-level security%',
  'no recs for fanfiction: they belong on AO3');
select test.ok(test.error_of($$insert into public.ratings (story_id, rating)
  select id, 4.5 from public.stories where source_id = '/works/OL2W#bg'$$) is null,
  'books can be rated');
select test.ok(test.error_of($$insert into public.reviews (story_id, body)
  select id, 'Loved it' from public.stories where source_id = '/works/OL2W#bg'$$) is null,
  'books can be reviewed');
select test.ok((select count(*) from public.ratings where user_id = auth.uid()) = 1, 'precondition: sally has one book rating');
select test.ok(test.error_of($$update public.ratings set story_id = (select id from public.stories where source_url = 'https://archiveofourown.org/works/5004')
  where user_id = auth.uid()$$) like '%row-level security%',
  'a book rating cannot be moved onto a fic');

-- 4. Normalising editions that existed before these rules (run by the migration) ----------------
select test.logout();
begin;
alter table public.stories drop constraint language_supported, drop constraint books_have_language,
  drop constraint open_library_edition_id;
insert into public.stories (id, kind, language, title, author_name, total_sections, status, source, source_id) values
  ('5a000000-0000-0000-0000-000000000001', 'book', null,        'Old', 'x', 1, 'completed', 'manual', null),
  ('5a000000-0000-0000-0000-000000000002', 'book', 'English',   'Old', 'x', 1, 'completed', 'manual', null),
  ('5a000000-0000-0000-0000-000000000003', 'book', 'Bulgarian', 'Old', 'x', 1, 'completed', 'open_library', '/works/OL9W'),
  ('5a000000-0000-0000-0000-000000000004', 'book', 'bg',        'Old', 'x', 1, 'completed', 'open_library', '/works/OL8W#en'),
  ('5a000000-0000-0000-0000-000000000005', 'book', 'fr',        'Old', 'x', 1, 'completed', 'manual', null);
insert into public.stories (id, kind, language, title, author_name, published_sections, status, source, source_url) values
  ('5a000000-0000-0000-0000-000000000006', 'fanfic', 'Deutsch', 'Old fic', 'w', 1, 'ongoing', 'ao3', 'https://archiveofourown.org/works/5099');
select public.normalise_story_editions();
alter table public.stories
  add constraint language_supported check (language in ('en', 'bg')),
  add constraint books_have_language check (kind <> 'book' or language is not null),
  add constraint open_library_edition_id check (source <> 'open_library' or source_id is null or source_id like '%#' || language);
select test.ok((select array_agg(language || ' ' || coalesce(source_id, '-') order by id) from public.stories where id::text like '5a000000%' and kind = 'book')
  = '{"en -","en -","bg /works/OL9W#bg","bg /works/OL8W#bg","en -"}',
  'old books get a supported edition language and an id that names it');
select test.ok((select language is null from public.stories where id = '5a000000-0000-0000-0000-000000000006'),
  'an old fic with an unsupported language just loses it');
rollback;

select test.logout();
\o
\echo 'STORY RULES PASSED'
