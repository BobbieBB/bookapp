-- Discover: the "Complete only" filter on "Lively in your fandoms" (docs/DECISIONS.md, 14 Oct 2026).
-- Runs after discover.test.sql (needs the test schema from spoiler_rules.test.sql).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

select test.logout();
-- Only this file's stories: earlier tests leave fics of their own. They are shown again at the end,
-- so the tests after this file see the database as it was.
create temp table complete_only_was_shown as select id from public.stories where kind = 'fanfic' and not is_hidden;
update public.stories set is_hidden = true where kind = 'fanfic';
insert into public.starter_fandoms (fandom, position) values ('Hannibal', 100) on conflict do nothing;

insert into auth.users (id) values ('00000000-0000-0000-0000-000000000cc1'), ('00000000-0000-0000-0000-000000000cc2');
insert into public.profiles (id, username, favourite_fandoms) values
  ('00000000-0000-0000-0000-000000000cc1', 'complete_cara', '{"Hannibal"}'), -- reads nothing yet, turns the filter on
  ('00000000-0000-0000-0000-000000000cc2', 'complete_cleo', '{}');           -- reads and talks

insert into public.stories (id, kind, title, author_name, fandoms, published_sections, total_sections, status, source, source_url) values
  ('cc500000-0000-0000-0000-000000000001', 'fanfic', 'H busy WIP',      'w', '{"Hannibal"}', 3, null, 'ongoing',   'ao3', 'https://archiveofourown.org/works/7101'),
  ('cc500000-0000-0000-0000-000000000002', 'fanfic', 'H talk complete', 'w', '{"Hannibal"}', 4, 4,    'completed', 'ao3', 'https://archiveofourown.org/works/7102'),
  ('cc500000-0000-0000-0000-000000000003', 'fanfic', 'W busy WIP',      'w', '{"Wipland"}',  2, null, 'ongoing',   'ao3', 'https://archiveofourown.org/works/7103'),
  ('cc500000-0000-0000-0000-000000000004', 'fanfic', 'W read complete', 'w', '{"Wipland"}',  2, 2,    'completed', 'ao3', 'https://archiveofourown.org/works/7104');

insert into public.library_entries (user_id, story_id, status, progress_section) values
  ('00000000-0000-0000-0000-000000000cc2', 'cc500000-0000-0000-0000-000000000001', 'currently_reading', 3),
  ('00000000-0000-0000-0000-000000000cc2', 'cc500000-0000-0000-0000-000000000002', 'finished', 4),
  ('00000000-0000-0000-0000-000000000cc2', 'cc500000-0000-0000-0000-000000000003', 'currently_reading', 2),
  ('00000000-0000-0000-0000-000000000cc2', 'cc500000-0000-0000-0000-000000000004', 'finished', 2);

-- Cleo talks this week about both Hannibal fics (the WIP most) and about the Wipland WIP only.
insert into public.discussions (id, story_id, kind, section_number) values
  ('cc600000-0000-0000-0000-000000000001', 'cc500000-0000-0000-0000-000000000001', 'chapter', 1),
  ('cc600000-0000-0000-0000-000000000002', 'cc500000-0000-0000-0000-000000000002', 'chapter', 1),
  ('cc600000-0000-0000-0000-000000000003', 'cc500000-0000-0000-0000-000000000003', 'chapter', 1);
insert into public.comments (discussion_id, author_id, body, created_at) values
  ('cc600000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000cc2', 'so good', now() - interval '1 day'),
  ('cc600000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000cc2', 'again', now() - interval '2 days'),
  ('cc600000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000cc2', 'finished it', now() - interval '1 day'),
  ('cc600000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000cc2', 'wip talk', now() - interval '1 day');

select test.login('00000000-0000-0000-0000-000000000cc1');
select test.ok((select array_agg(title order by rank) from public.lively_in_fandoms('{"Hannibal"}')) = '{"H busy WIP","H talk complete"}',
  'without the filter: complete and WIP fics');
select test.ok((select array_agg(title order by rank) from public.lively_in_fandoms('{"Hannibal"}', false)) = '{"H busy WIP","H talk complete"}',
  'the filter is off unless asked for');
select test.ok((select array_agg(title || ':' || tier order by rank) from public.lively_in_fandoms('{"Hannibal"}', true)) = '{"H talk complete:week"}',
  'Complete only: only complete fics');
select test.ok((select array_agg(title || ':' || tier order by rank) from public.lively_in_fandoms('{"Wipland"}', true)) = '{"W read complete:readers"}',
  'Complete only: a week with only WIP talk widens like the unfiltered list (here to the most read)');
select test.ok((select count(*) > 0 and bool_and(tier = 'starter' and status = 'completed') from public.lively_in_fandoms('{"Nothing Here"}', true)),
  'Complete only: then the starter fandoms, complete fics only');

select test.logout();
update public.stories set is_hidden = true where status = 'completed';
select test.login('00000000-0000-0000-0000-000000000cc1');
select test.ok((select count(*) from public.lively_in_fandoms('{"Wipland"}', true)) = 0
  and (select count(*) from public.lively_in_fandoms('{"Wipland"}')) > 0,
  'Complete only with no complete fic anywhere: empty (the app suggests turning it off); off still finds WIPs');

select test.logout();
select test.ok(test.error_of($$set role anon; select * from public.lively_in_fandoms('{"Hannibal"}', true)$$) is not null,
  'signed-out visitors cannot use Discover');
reset role;

update public.stories set is_hidden = true where id::text like 'cc500000-%';
update public.stories set is_hidden = false where id in (select id from complete_only_was_shown);
delete from public.starter_fandoms where fandom = 'Hannibal';
select test.ok((select array_agg(id order by id) from public.stories where kind = 'fanfic' and not is_hidden)
    is not distinct from (select array_agg(id order by id) from complete_only_was_shown)
  and not exists (select 1 from public.starter_fandoms where fandom = 'Hannibal'),
  'the fics shown before this file are shown again, and only those');
\o
\echo 'DISCOVER COMPLETE ONLY PASSED'
