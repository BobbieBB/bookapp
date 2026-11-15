-- A fic without a link (20261115000300_fic_without_link.sql; docs/DECISIONS.md, PO testing round, G): added
-- by hand as source 'manual', kept out of Discover, and given its AO3 link later by a reader who has it.
-- Runs after spoiler_rules.test.sql (needs its test schema).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

create or replace function test.code_of(sql text) returns text language plpgsql as $$
begin
  execute sql;
  return null;
exception when others then
  return sqlstate;
end $$;
grant execute on function test.code_of(text) to authenticated;

select test.logout();
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000f1001'), ('00000000-0000-0000-0000-0000000f1002');
insert into public.profiles (id, username) values
  ('00000000-0000-0000-0000-0000000f1001', 'linkless_lia'), ('00000000-0000-0000-0000-0000000f1002', 'linkless_stranger');
-- Another fic already has the link the test tries to reuse.
insert into public.stories (id, kind, title, author_name, fandoms, source, source_url, status, has_chapters, published_sections, total_sections)
  values ('f1500000-0000-0000-0000-000000000009', 'fanfic', 'Taken', 'x', '{Linkless Fandom}', 'ao3',
          'https://archiveofourown.org/works/7770001', 'completed', true, 3, 3);

select test.login('00000000-0000-0000-0000-0000000f1001');
select test.ok(test.code_of($$insert into public.stories (id, kind, title, author_name, fandoms, source, status, has_chapters, published_sections, total_sections)
  values ('f1500000-0000-0000-0000-000000000001', 'fanfic', 'Off the archive', 'someone', '{Linkless Fandom}', 'manual', 'completed', true, 4, 4)$$) is null,
  'a reader adds a fic by hand, with no link');
select test.ok(test.code_of($$insert into public.stories (kind, title, author_name, source, status, has_chapters, published_sections)
  values ('fanfic', 'Says AO3', 'someone', 'ao3', 'completed', true, 1)$$) = '23514',
  'an AO3 fic still needs its link');
insert into public.library_entries (user_id, story_id, status) values
  ('00000000-0000-0000-0000-0000000f1001', 'f1500000-0000-0000-0000-000000000001', 'currently_reading');

select test.logout();
select test.ok(not exists (select 1 from public.visible_fics() where id = 'f1500000-0000-0000-0000-000000000001'),
  'a fic without a link stays out of Discover and the fandom search');

select test.login('00000000-0000-0000-0000-0000000f1002');
select test.ok(test.code_of($$select public.set_fic_link('f1500000-0000-0000-0000-000000000001', 'https://archiveofourown.org/works/7770002')$$) = '42501',
  'a reader who does not have the fic cannot add its link');

select test.login('00000000-0000-0000-0000-0000000f1001');
select test.ok(test.code_of($$select public.set_fic_link('f1500000-0000-0000-0000-000000000001', 'https://example.com/works/1')$$) = '22023',
  'only an AO3 work link');
select test.ok(test.code_of($$select public.set_fic_link('f1500000-0000-0000-0000-000000000001', 'https://archiveofourown.org/works/7770001')$$) = '23505',
  'a link another fic already has is refused');
select test.ok(test.code_of($$select public.set_fic_link('f1500000-0000-0000-0000-000000000001', 'https://archiveofourown.org/works/7770002')$$) is null,
  'a reader who has it adds the link');
select test.ok((select source = 'ao3' and source_url = 'https://archiveofourown.org/works/7770002' from public.stories where id = 'f1500000-0000-0000-0000-000000000001'),
  '... and it becomes an AO3 fic');
select test.ok(test.code_of($$select public.set_fic_link('f1500000-0000-0000-0000-000000000001', 'https://archiveofourown.org/works/7770003')$$) = '55000',
  'once only: a link is not changed afterwards');

select test.logout();
select test.ok(exists (select 1 from public.visible_fics() where id = 'f1500000-0000-0000-0000-000000000001'),
  'with its link, it can show up in Discover');

\o
\echo 'FIC WITHOUT LINK RULES PASSED'
