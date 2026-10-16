-- Discover (docs/DECISIONS.md, 14 Oct 2026: "which fandoms to show" and "Lively in your fandoms").
-- Runs after the other SQL tests (needs the test schema from spoiler_rules.test.sql).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

select test.logout();
-- Only this file's stories: earlier tests leave fics of their own.
update public.stories set is_hidden = true where kind = 'fanfic';
insert into public.starter_fandoms (fandom, position) values ('Good Omens', 0) on conflict do nothing;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000f01'), ('00000000-0000-0000-0000-000000000f02'),
  ('00000000-0000-0000-0000-000000000f03'), ('00000000-0000-0000-0000-000000000f04');
insert into public.profiles (id, username, favourite_fandoms) values
  ('00000000-0000-0000-0000-000000000f01', 'fia', '{"Good Omens"}'),   -- picked Good Omens, reads a Sherlock fic
  ('00000000-0000-0000-0000-000000000f02', 'filip', '{}'),             -- picked nothing, reads nothing
  ('00000000-0000-0000-0000-000000000f03', 'flora', '{}'),             -- writes the comments
  ('00000000-0000-0000-0000-000000000f04', 'fani', '{"Good Omens"}');  -- reads only complete fics

insert into public.stories (id, kind, title, author_name, fandoms, published_sections, total_sections, status, source, source_url, created_at) values
  ('f5000000-0000-0000-0000-000000000001', 'fanfic', 'GO busy WIP',      'w', '{"Good Omens"}', 3, null, 'ongoing',   'ao3', 'https://archiveofourown.org/works/7001', now() - interval '3 days'),
  ('f5000000-0000-0000-0000-000000000002', 'fanfic', 'GO quiet complete', 'w', '{"Good Omens"}', 5, 5,    'completed', 'ao3', 'https://archiveofourown.org/works/7002', now() - interval '2 days'),
  ('f5000000-0000-0000-0000-000000000003', 'fanfic', 'Sherlock fic',      'w', '{"Sherlock (TV)"}', 2, 2, 'completed', 'ao3', 'https://archiveofourown.org/works/7003', now()),
  ('f5000000-0000-0000-0000-000000000004', 'fanfic', 'GO old talk',       'w', '{"Good Omens"}', 4, 4,    'completed', 'ao3', 'https://archiveofourown.org/works/7004', now() - interval '1 day'),
  ('f5000000-0000-0000-0000-000000000005', 'fanfic', 'Hidden GO',         'w', '{"Good Omens"}', 1, 1,    'completed', 'ao3', 'https://archiveofourown.org/works/7005', now());
update public.stories set is_hidden = true where id = 'f5000000-0000-0000-0000-000000000005';

insert into public.library_entries (user_id, story_id, status, progress_section) values
  ('00000000-0000-0000-0000-000000000f01', 'f5000000-0000-0000-0000-000000000003', 'currently_reading', 1),
  ('00000000-0000-0000-0000-000000000f03', 'f5000000-0000-0000-0000-000000000001', 'currently_reading', 3),
  ('00000000-0000-0000-0000-000000000f03', 'f5000000-0000-0000-0000-000000000002', 'finished', 5),
  ('00000000-0000-0000-0000-000000000f03', 'f5000000-0000-0000-0000-000000000004', 'finished', 4),
  ('00000000-0000-0000-0000-000000000f04', 'f5000000-0000-0000-0000-000000000002', 'finished', 5),
  ('00000000-0000-0000-0000-000000000f04', 'f5000000-0000-0000-0000-000000000003', 'finished', 2);

-- Flora talks about the busy WIP this week, and about "GO old talk" three weeks ago.
insert into public.discussions (id, story_id, kind, section_number) values
  ('f6000000-0000-0000-0000-000000000001', 'f5000000-0000-0000-0000-000000000001', 'chapter', 1),
  ('f6000000-0000-0000-0000-000000000004', 'f5000000-0000-0000-0000-000000000004', 'chapter', 1);
insert into public.comments (discussion_id, author_id, body, created_at) values
  ('f6000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000f03', 'so good', now() - interval '1 day'),
  ('f6000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000f03', 'again', now() - interval '2 days'),
  ('f6000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000f03', 'back then', now() - interval '21 days');

-- 1. Your fandoms --------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-000000000f01');
select test.ok((select array_agg(fandom order by place) from public.my_fandoms()) = '{"Good Omens","Sherlock (TV)"}',
  'your fandoms: the ones you picked, then the fandoms of fics in your library');
select test.ok((select array_agg(fandom) from public.suggested_fandoms()) = '{"Sherlock (TV)"}',
  'a fandom from your library you have not picked is suggested');
select test.login('00000000-0000-0000-0000-000000000f02');
select test.ok((select count(*) from public.my_fandoms()) between 1 and 6 and (select bool_and(source = 'starter') from public.my_fandoms()),
  'someone who picked nothing gets the curated starter fandoms');

-- 2. All fandoms: search over fandoms in the app, most active first ------------------
select test.ok((select array_agg(fandom order by rank) from public.search_fandoms('')) = '{"Good Omens","Sherlock (TV)"}',
  'all fandoms in the app, the one with discussion this week first; hidden stories do not count');
select test.ok((select array_agg(fandom) from public.search_fandoms('sher')) = '{"Sherlock (TV)"}', 'search is by name, any case');
select test.ok((select count(*) from public.search_fandoms('%')) = 0, 'search text is not a pattern');

-- 3. Lively in your fandoms ------------------------------------------------------------
select test.login('00000000-0000-0000-0000-000000000f01');
select test.ok((select array_agg(title order by rank) from public.lively_in_fandoms('{"Good Omens"}')) = '{"GO busy WIP"}',
  'ranked by discussion this week; only stories you do not read yet');
select test.logout();
alter table public.comments disable trigger user; -- only the test moves comments in time
update public.comments set created_at = now() - interval '20 days' where discussion_id = 'f6000000-0000-0000-0000-000000000001';
alter table public.comments enable trigger user;
select test.login('00000000-0000-0000-0000-000000000f01');
select test.ok((select array_agg(title order by rank) from public.lively_in_fandoms('{"Good Omens"}')) = '{"GO busy WIP","GO old talk"}'
  and (select bool_and(tier = 'month') from public.lively_in_fandoms('{"Good Omens"}')),
  'a quiet week widens to 30 days');
select test.logout();
alter table public.comments disable trigger user; -- only the test moves comments in time
update public.comments set created_at = now() - interval '60 days' where discussion_id in ('f6000000-0000-0000-0000-000000000001', 'f6000000-0000-0000-0000-000000000004');
alter table public.comments enable trigger user;
select test.login('00000000-0000-0000-0000-000000000f01');
select test.ok((select array_agg(title order by rank) from public.lively_in_fandoms('{"Good Omens"}')) = '{"GO quiet complete","GO old talk","GO busy WIP"}'
  and (select bool_and(tier = 'readers') from public.lively_in_fandoms('{"Good Omens"}')),
  'a quiet month widens to the most-read (newest first on a tie)');
select test.ok((select count(*) > 0 and bool_and(tier = 'starter') from public.lively_in_fandoms('{"Nothing Here"}')),
  'never empty while the app has fics: then the starter fandoms');

select test.logout();
-- Readers whose library (2+ fics) is (almost) all complete fics see complete fics first.
alter table public.comments disable trigger user; -- only the test moves comments in time
update public.comments set created_at = now() - interval '1 day' where discussion_id in ('f6000000-0000-0000-0000-000000000001', 'f6000000-0000-0000-0000-000000000004');
alter table public.comments enable trigger user;
select test.login('00000000-0000-0000-0000-000000000f04');
select test.ok((select array_agg(title order by rank) from public.lively_in_fandoms('{"Good Omens"}')) = '{"GO old talk","GO busy WIP"}',
  'if your library is all complete fics, complete ones rank first');

select test.logout();
select test.ok(test.error_of($$set role anon; select * from public.lively_in_fandoms('{"Good Omens"}')$$) is not null,
  'signed-out visitors cannot use Discover');
reset role;
\o
\echo 'DISCOVER PASSED'
