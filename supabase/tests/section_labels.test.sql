-- Parts and acts (20261115000400_section_labels.sql; docs/DECISIONS.md, PO testing round, E): only a
-- word for a book's sections; fics and books split by pages keep "chapter". Runs after spoiler_rules.test.sql.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

select test.logout();
insert into public.stories (id, kind, title, author_name, language, has_chapters, total_sections, status, source, section_label)
  values ('5e500000-0000-0000-0000-000000000001', 'book', 'A play', 'x', 'en', true, 4, 'completed', 'manual', 'act');
select test.ok((select section_label = 'act' from public.stories where id = '5e500000-0000-0000-0000-000000000001'), 'a book can be in acts');
insert into public.stories (id, kind, title, author_name, language, has_chapters, total_sections, status, source)
  values ('5e500000-0000-0000-0000-000000000002', 'book', 'A novel', 'x', 'en', true, 10, 'completed', 'manual');
select test.ok((select section_label = 'chapter' from public.stories where id = '5e500000-0000-0000-0000-000000000002'), 'chapters by default');
select test.ok(test.error_of($$insert into public.stories (kind, title, author_name, language, has_chapters, total_sections, status, source, section_label)
  values ('book', 'Odd', 'x', 'en', true, 3, 'completed', 'manual', 'scene')$$) is not null, 'only chapter, part or act');
select test.ok(test.error_of($$insert into public.stories (kind, title, author_name, fandoms, has_chapters, published_sections, total_sections, status, source, source_url, section_label)
  values ('fanfic', 'Fic', 'x', '{F}', true, 3, 3, 'completed', 'ao3', 'https://archiveofourown.org/works/5550001', 'act')$$) is not null, 'fics are in chapters');
select test.ok(test.error_of($$insert into public.stories (kind, title, author_name, language, has_chapters, page_count, status, source, section_label)
  values ('book', 'Paged', 'x', 'en', false, 200, 'completed', 'manual', 'part')$$) is not null, 'a book split by pages keeps the default');

\o
\echo 'SECTION LABEL RULES PASSED'
