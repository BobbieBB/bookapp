-- Reports, removal requests and blocking (docs/DECISIONS.md: Fandom etiquette; DATA_MODEL.md:
-- Blocking). Runs after spoiler_rules.test.sql (needs its test schema).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

select test.logout();
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000501'), ('00000000-0000-0000-0000-000000000502'), ('00000000-0000-0000-0000-000000000503');
insert into public.profiles (id, username) values
  ('00000000-0000-0000-0000-000000000501', 'sara'),   -- reads chapter 1
  ('00000000-0000-0000-0000-000000000502', 'sami'),   -- finished, writes in chapter 2
  ('00000000-0000-0000-0000-000000000503', 'sofi');   -- finished
insert into public.stories (id, kind, language, title, author_name, total_sections, status) values
  ('55000000-0000-0000-0000-000000000001', 'book', 'en', 'Safety', 'x', 2, 'completed');
insert into public.library_entries (user_id, story_id, status, progress_section) values
  ('00000000-0000-0000-0000-000000000501', '55000000-0000-0000-0000-000000000001', 'currently_reading', 1),
  ('00000000-0000-0000-0000-000000000502', '55000000-0000-0000-0000-000000000001', 'finished', 2),
  ('00000000-0000-0000-0000-000000000503', '55000000-0000-0000-0000-000000000001', 'finished', 2);
insert into public.discussions (id, story_id, kind, section_number) values
  ('56000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000001', 'chapter', 1),
  ('56000000-0000-0000-0000-000000000002', '55000000-0000-0000-0000-000000000001', 'chapter', 2);
insert into public.comments (id, discussion_id, author_id, body) values
  ('57000000-0000-0000-0000-000000000001', '56000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000502', 'ch1 talk'),
  ('57000000-0000-0000-0000-000000000002', '56000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000502', 'ch2 secret'),
  ('57000000-0000-0000-0000-000000000003', '56000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000501', 'sara on ch1');

-- 1. Reports ---------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-000000000501');
select test.ok(test.error_of($$insert into public.reports (comment_id, reason) values ('57000000-0000-0000-0000-000000000002', 'spoiler')$$)
  like '%row-level security%', 'a comment in a room you have not unlocked cannot be reported');
insert into public.reports (comment_id, reason) values ('57000000-0000-0000-0000-000000000001', 'spam');
select test.ok(test.error_of($$insert into public.reports (comment_id, reason) values ('57000000-0000-0000-0000-000000000001', 'spam')$$)
  like '%duplicate key%', 'the same comment is reported once per reader');
select test.ok(test.error_of($$insert into public.reports (comment_id, reason) values ('57000000-0000-0000-0000-000000000003', 'spam')$$)
  like '%row-level security%', 'you cannot report your own comment');
select test.ok(test.error_of($$insert into public.reports (reported_user_id, reason) values (auth.uid(), 'spam')$$)
  like '%row-level security%', 'you cannot report yourself');
insert into public.reports (reported_user_id, reason) values ('00000000-0000-0000-0000-000000000502', 'harassment');
select test.ok(test.error_of($$insert into public.reports (reported_user_id, reason) values ('00000000-0000-0000-0000-000000000502', 'other')$$)
  like '%duplicate key%', 'the same reader is reported once per reader');

-- 2. Rate limits ------------------------------------------------------------------
select test.ok(test.error_of($$insert into public.feedback (kind, body) select 'idea', 'x' || n from generate_series(1, 11) n$$)
  like '%too many%', 'at most 10 feedback messages an hour');
select test.ok(test.error_of($$insert into public.removal_requests (story_url, contact) select 'https://archiveofourown.org/works/' || n, 'a@b.c' from generate_series(1, 6) n$$)
  like '%too many%', 'at most 5 removal requests a day');

-- 3. Removal requests need a way to reach the author -------------------------------
select test.ok(test.error_of($$insert into public.removal_requests (story_url) values ('https://archiveofourown.org/works/1')$$)
  like '%removal_contact%', 'a removal request needs a contact');
select test.ok(test.error_of($$insert into public.removal_requests (story_url, contact) values ('https://evil.example/x', 'a@b.c')$$)
  like '%removal_story_url%', 'a removal request is for an AO3 work link');

-- 4. Blocking hides reactions and notifications too ---------------------------------
select test.login('00000000-0000-0000-0000-000000000503');
insert into public.reactions (comment_id, emoji) values ('57000000-0000-0000-0000-000000000003', '🔥');
insert into public.comments (discussion_id, parent_id, body) values ('56000000-0000-0000-0000-000000000001', '57000000-0000-0000-0000-000000000003', 'reply to sara');
select test.login('00000000-0000-0000-0000-000000000501');
select test.ok((select count(*) from public.reactions where comment_id = '57000000-0000-0000-0000-000000000003') = 1
  and (select count(*) from public.notifications where actor_id = '00000000-0000-0000-0000-000000000503') = 2, 'before blocking: their reaction and notifications');
insert into public.blocks (blocked_id) values ('00000000-0000-0000-0000-000000000503');
select test.ok((select count(*) from public.reactions where comment_id = '57000000-0000-0000-0000-000000000003') = 0,
  'reactions by people you blocked are hidden');
select test.ok((select count(*) from public.notifications where actor_id = '00000000-0000-0000-0000-000000000503') = 0,
  'notifications from people you blocked are hidden');

select test.logout();
\o
\echo 'SAFETY RULES PASSED'
