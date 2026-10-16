-- Home: replies and @mentions to you, and "N new comments in chapter X" (docs/DECISIONS.md, Home;
-- Spoiler Safe Mode 5: notifications follow the same rule and never contain comment text).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

select test.logout();
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000701'), ('00000000-0000-0000-0000-000000000702'),
  ('00000000-0000-0000-0000-000000000703'), ('00000000-0000-0000-0000-000000000704');
insert into public.profiles (id, username) values
  ('00000000-0000-0000-0000-000000000701', 'Hana'),   -- finished chapter 2
  ('00000000-0000-0000-0000-000000000702', 'hristo'), -- finished the book, talks a lot
  ('00000000-0000-0000-0000-000000000703', 'hari'),   -- finished chapter 1 only
  ('00000000-0000-0000-0000-000000000704', 'hel');    -- blocked by Hana
insert into public.stories (id, kind, language, title, author_name, total_sections, status) values
  ('77000000-0000-0000-0000-000000000001', 'book', 'en', 'Home Book', 'x', 3, 'completed');
insert into public.library_entries (user_id, story_id, status, progress_section) values
  ('00000000-0000-0000-0000-000000000701', '77000000-0000-0000-0000-000000000001', 'currently_reading', 2),
  ('00000000-0000-0000-0000-000000000702', '77000000-0000-0000-0000-000000000001', 'finished', 3),
  ('00000000-0000-0000-0000-000000000703', '77000000-0000-0000-0000-000000000001', 'currently_reading', 1),
  ('00000000-0000-0000-0000-000000000704', '77000000-0000-0000-0000-000000000001', 'finished', 3);
insert into public.blocks (blocker_id, blocked_id) values ('00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000704');

-- Hana writes in chapter 2 (and so follows it).
select test.login('00000000-0000-0000-0000-000000000701');
select public.open_discussion('77000000-0000-0000-0000-000000000001', 'chapter', 2);
insert into public.comments (id, discussion_id, body)
  select '78000000-0000-0000-0000-000000000001', id, 'What did you all think?' from public.discussions
  where story_id = '77000000-0000-0000-0000-000000000001' and section_number = 2;

-- Hristo replies, and mentions Hana (any capitals) and hari in chapter 2; hari hasn't read it.
select test.login('00000000-0000-0000-0000-000000000702');
insert into public.comments (discussion_id, parent_id, body)
  select id, '78000000-0000-0000-0000-000000000001', 'Loved it, @hana!' from public.discussions
  where story_id = '77000000-0000-0000-0000-000000000001' and section_number = 2;
insert into public.comments (discussion_id, body)
  select id, '@HANA @hari @nobody @hristo look at this' from public.discussions
  where story_id = '77000000-0000-0000-0000-000000000001' and section_number = 2;
-- hel (blocked by Hana) mentions her.
select test.login('00000000-0000-0000-0000-000000000704');
insert into public.comments (discussion_id, body)
  select id, 'hey @Hana' from public.discussions
  where story_id = '77000000-0000-0000-0000-000000000001' and section_number = 2;

-- 1. Mentions ----------------------------------------------------------------------
select test.logout();
select test.ok((select count(*) from public.notifications where user_id = '00000000-0000-0000-0000-000000000701' and type = 'reply') = 1,
  'a reply notifies the comment author');
select test.ok((select count(*) from public.notifications where user_id = '00000000-0000-0000-0000-000000000701' and type = 'mention') = 1,
  'a mention notifies once per comment, any capitals, and not on top of a reply notification');
select test.ok((select count(*) from public.notifications where user_id = '00000000-0000-0000-0000-000000000703') = 0,
  'a reader who has not reached the chapter is not notified of a mention there');
select test.ok((select count(*) from public.notifications where user_id = '00000000-0000-0000-0000-000000000702' and type = 'mention') = 0,
  'mentioning yourself does nothing');
select test.ok((select count(*) from public.notifications where actor_id = '00000000-0000-0000-0000-000000000704') = 0,
  'no mention notifications between blocked readers');

-- 2. Notifications as the app reads them: no comment text, only where you can go --------
select test.login('00000000-0000-0000-0000-000000000701');
select test.ok((select count(*) from public.my_notifications(10)) = 2, 'your replies and mentions');
select test.ok((select bool_and(story_title = 'Home Book' and section_number = 2 and actor_username = 'hristo') from public.my_notifications(10)),
  'they say who, which story and which chapter');
select test.ok(not exists (
    select 1 from information_schema.routines r join information_schema.parameters p using (specific_name)
    where r.routine_name = 'my_notifications' and p.parameter_mode = 'OUT' and p.parameter_name in ('body', 'comment_body', 'text')),
  'no comment text in notifications');
update public.library_entries set progress_section = 1 where user_id = auth.uid() and story_id = '77000000-0000-0000-0000-000000000001';
select test.ok((select count(*) from public.my_notifications(10)) = 0, 'moving progress back hides notifications from chapters you closed again');
update public.library_entries set progress_section = 2 where user_id = auth.uid() and story_id = '77000000-0000-0000-0000-000000000001';
select test.ok((select count(*) from public.my_notifications(1)) = 1, 'a limit');
select public.mark_notifications_read();
select test.ok((select bool_and(read_at is not null) from public.notifications where user_id = auth.uid()), 'mark all read');

-- 3. "N new comments in chapter X" ---------------------------------------------------
update public.discussion_follows set last_read_at = now() - interval '1 hour' where user_id = auth.uid();
select test.ok((select new_comments from public.continue_reading_hints() where story_id = '77000000-0000-0000-0000-000000000001') = 2
  and (select section_number from public.continue_reading_hints() where story_id = '77000000-0000-0000-0000-000000000001') = 2,
  'new comments since you last read your latest chapter, not your own, not from people you blocked');
select test.login('00000000-0000-0000-0000-000000000703');
select test.ok((select new_comments from public.continue_reading_hints() where story_id = '77000000-0000-0000-0000-000000000001') = 0,
  'your hint is about your latest chapter only (chapter 2 talk is not counted for someone on chapter 1)');

select test.logout();
\o
\echo 'HOME RULES PASSED'
