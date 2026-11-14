-- Telling the people a moderation decision affects (EU Digital Services Act arts. 16(5) and 17;
-- docs/DECISIONS.md, Moderation notices). Hiding a comment or review tells its author why, never who
-- reported; resolving a report tells each reporter what was decided. Neither ever buzzes a phone.
-- Runs after spoiler_rules.test.sql (needs its test schema).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

select test.logout();
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000c11'), ('00000000-0000-0000-0000-000000000c12'),
  ('00000000-0000-0000-0000-000000000c13'), ('00000000-0000-0000-0000-000000000c14'), ('00000000-0000-0000-0000-000000000c1d');
insert into public.profiles (id, username, is_admin) values
  ('00000000-0000-0000-0000-000000000c11', 'nalma', false),  -- writes the comment and the review
  ('00000000-0000-0000-0000-000000000c12', 'nrita', false),  -- reports; has blocked nalma
  ('00000000-0000-0000-0000-000000000c13', 'nremy', false),  -- reports too
  ('00000000-0000-0000-0000-000000000c14', 'nzed', false),   -- reports late, and a comment its author deleted
  ('00000000-0000-0000-0000-000000000c1d', 'nadmin', true);
insert into public.stories (id, kind, language, title, author_name, has_chapters, total_sections, status, source_url) values
  ('c1000000-0000-0000-0000-000000000001', 'book', 'en', 'Notice Book', 'x', true, 5, 'completed', null),
  ('c1000000-0000-0000-0000-000000000002', 'fanfic', 'en', 'Notice Fic', 'x', true, null, 'ongoing', 'https://archiveofourown.org/works/81201');
insert into public.library_entries (user_id, story_id, status, progress_section) values
  ('00000000-0000-0000-0000-000000000c11', 'c1000000-0000-0000-0000-000000000001', 'finished', 5),
  ('00000000-0000-0000-0000-000000000c12', 'c1000000-0000-0000-0000-000000000001', 'finished', 5),
  ('00000000-0000-0000-0000-000000000c13', 'c1000000-0000-0000-0000-000000000001', 'finished', 5),
  ('00000000-0000-0000-0000-000000000c12', 'c1000000-0000-0000-0000-000000000002', 'want_to_read', 0);
insert into public.discussions (id, story_id, kind, section_number) values
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'chapter', 3);
insert into public.comments (id, discussion_id, author_id, body) values
  ('c3000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000c11', 'buy my stuff'),
  ('c3000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000c11', 'regret this');
insert into public.reviews (id, user_id, story_id, body) values
  ('c4000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000c11', 'c1000000-0000-0000-0000-000000000001', 'the twist is X');
insert into public.blocks (blocker_id, blocked_id) values ('00000000-0000-0000-0000-000000000c12', '00000000-0000-0000-0000-000000000c11');
insert into public.reports (id, reporter_id, comment_id, reason) values
  ('c5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000c12', 'c3000000-0000-0000-0000-000000000001', 'spam'),
  ('c5000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000c13', 'c3000000-0000-0000-0000-000000000001', 'harassment');
insert into public.reports (id, reporter_id, review_id, reason) values
  ('c5000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000c12', 'c4000000-0000-0000-0000-000000000001', 'other'),
  ('c5000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000c13', 'c4000000-0000-0000-0000-000000000001', 'spoiler');
insert into public.reports (id, reporter_id, reported_user_id, reason) values
  ('c5000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000c13', '00000000-0000-0000-0000-000000000c11', 'harassment');
insert into public.removal_requests (id, story_id, story_url, contact, message) values
  ('c6000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'https://archiveofourown.org/works/81201', 'a@b.co', 'please hide');

-- Sending is on, and every push that would go out is caught here.
create table test.notice_pushes (body jsonb);
create schema if not exists net;
create function net.http_post(url text, body jsonb, headers jsonb) returns bigint language plpgsql as $f$
begin insert into test.notice_pushes select m from jsonb_array_elements(body) m; return 1; end $f$;
update public.push_settings set enabled = true;
insert into public.push_tokens (token, user_id, language, platform) values
  ('ExponentPushToken[nalma]', '00000000-0000-0000-0000-000000000c11', 'en', 'ios'),
  ('ExponentPushToken[nrita]', '00000000-0000-0000-0000-000000000c12', 'en', 'ios'),
  ('ExponentPushToken[nremy]', '00000000-0000-0000-0000-000000000c13', 'en', 'ios');

create view test.notices as
  select * from public.notifications
  where user_id in ('00000000-0000-0000-0000-000000000c11', '00000000-0000-0000-0000-000000000c12', '00000000-0000-0000-0000-000000000c13',
                    '00000000-0000-0000-0000-000000000c14');

-- The push path is live: a reply notification here does buzz (so "no push" below means something).
insert into public.notifications (id, user_id, type, discussion_id) values
  ('c7000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000c11', 'reply', 'c2000000-0000-0000-0000-000000000001');
select test.ok((select count(*) from test.notice_pushes) = 1
  and (select pushed_at is not null from public.notifications where id = 'c7000000-0000-0000-0000-000000000001'),
  'sending is on: a reply notification is pushed at once and marked pushed');

-- 1. Hiding a comment: the author is told why, every reporter what was decided ---------------------
select test.login('00000000-0000-0000-0000-000000000c1d');
select public.moderation_resolve('comment_report', 'c5000000-0000-0000-0000-000000000001', 'hide');
select test.logout();
select test.ok((select count(*) from test.notices where user_id = '00000000-0000-0000-0000-000000000c11' and type::text = 'content_hidden') = 1,
  'the comment''s author gets one content_hidden notice');
select test.ok((select row(content_kind, reason::text, story_id, discussion_id, actor_id, comment_id)::text from test.notices
                where user_id = '00000000-0000-0000-0000-000000000c11' and type::text = 'content_hidden')
  = row('comment', 'spam', 'c1000000-0000-0000-0000-000000000001'::uuid, 'c2000000-0000-0000-0000-000000000001'::uuid, null::uuid, null::uuid)::text,
  'it carries the content type, the story and chapter room, and the report reason, but no reporter');
select test.ok((select array_agg(row(user_id, content_kind, outcome::text, story_id, actor_id)::text order by user_id) from test.notices where type::text = 'report_resolved')
  = array[row('00000000-0000-0000-0000-000000000c12'::uuid, 'comment', 'actioned', 'c1000000-0000-0000-0000-000000000001'::uuid, null::uuid)::text,
          row('00000000-0000-0000-0000-000000000c13'::uuid, 'comment', 'actioned', 'c1000000-0000-0000-0000-000000000001'::uuid, null::uuid)::text],
  'each reporter of the comment gets one report_resolved: actioned, and never naming the author (even across a block)');

-- 1b. A late report on the hidden comment, and a comment its author had deleted -----------------------
-- (an open report on an already hidden comment can only be filed directly; the app's policy refuses it)
insert into public.reports (id, reporter_id, comment_id, reason) values
  ('c5000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000c14', 'c3000000-0000-0000-0000-000000000001', 'other');
select test.login('00000000-0000-0000-0000-000000000c1d');
select public.moderation_resolve('comment_report', 'c5000000-0000-0000-0000-000000000006', 'hide');
select test.logout();
select test.ok((select count(*) from test.notices where user_id = '00000000-0000-0000-0000-000000000c11' and type::text = 'content_hidden') = 1,
  'hiding an already hidden comment again does not tell its author twice');
select test.ok((select array_agg(user_id order by user_id) from test.notices where type::text = 'report_resolved' and content_kind = 'comment')
  = array['00000000-0000-0000-0000-000000000c12', '00000000-0000-0000-0000-000000000c13', '00000000-0000-0000-0000-000000000c14']::uuid[],
  'and every reporter of that comment, early or late, gets exactly one report_resolved');
insert into public.reports (id, reporter_id, comment_id, reason) values
  ('c5000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000c14', 'c3000000-0000-0000-0000-000000000002', 'spam');
update public.comments set deleted_at = now() where id = 'c3000000-0000-0000-0000-000000000002';
select test.login('00000000-0000-0000-0000-000000000c1d');
select public.moderation_resolve('comment_report', 'c5000000-0000-0000-0000-000000000007', 'hide');
select test.logout();
select test.ok((select is_hidden from public.comments where id = 'c3000000-0000-0000-0000-000000000002'),
  'a comment its author already deleted is still hidden');
select test.ok((select count(*) from test.notices where user_id = '00000000-0000-0000-0000-000000000c11' and type::text = 'content_hidden') = 1,
  'but its author is not told (they deleted it themselves)');
select test.ok((select count(*) from test.notices where user_id = '00000000-0000-0000-0000-000000000c14' and type::text = 'report_resolved') = 2,
  'its reporter still hears we acted');

-- 2. Reviews: dismissing tells only the reporter; hiding tells the author and the reporter ----------
select test.login('00000000-0000-0000-0000-000000000c1d');
select public.moderation_resolve('review_report', 'c5000000-0000-0000-0000-000000000003', 'dismiss');
select test.logout();
select test.ok((select row(content_kind, outcome::text, story_id, discussion_id)::text from test.notices
                where user_id = '00000000-0000-0000-0000-000000000c12' and type::text = 'report_resolved' and content_kind = 'review')
  = row('review', 'dismissed', 'c1000000-0000-0000-0000-000000000001'::uuid, null::uuid)::text,
  'a dismissed review report tells its reporter we didn''t remove it');
select test.ok(not exists (select 1 from test.notices where type::text = 'content_hidden' and content_kind = 'review'),
  'and the review''s author hears nothing (nothing happened to their review)');
select test.login('00000000-0000-0000-0000-000000000c1d');
select public.moderation_resolve('review_report', 'c5000000-0000-0000-0000-000000000004', 'hide');
select test.logout();
select test.ok((select row(reason::text, story_id, discussion_id, actor_id)::text from test.notices
                where user_id = '00000000-0000-0000-0000-000000000c11' and type::text = 'content_hidden' and content_kind = 'review')
  = row('spoiler', 'c1000000-0000-0000-0000-000000000001'::uuid, null::uuid, null::uuid)::text,
  'hiding a review tells its author, with the reason and the story');
select test.ok((select outcome::text from test.notices
                where user_id = '00000000-0000-0000-0000-000000000c13' and type::text = 'report_resolved' and content_kind = 'review') = 'actioned',
  'and its reporter that we hid it');

-- 3. Reports about a reader ------------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-000000000c1d');
select public.moderation_resolve('user_report', 'c5000000-0000-0000-0000-000000000005', 'dismiss');
select test.logout();
select test.ok((select row(outcome::text, story_id, discussion_id, actor_id)::text from test.notices
                where user_id = '00000000-0000-0000-0000-000000000c13' and type::text = 'report_resolved' and content_kind = 'reader')
  = row('dismissed', null::uuid, null::uuid, null::uuid)::text,
  'a dismissed report about a reader tells the reporter, without naming the reader');
select test.ok(test.error_of($$insert into public.notifications (user_id, type, actor_id, story_id, content_kind, reason)
  values ('00000000-0000-0000-0000-000000000c11', 'content_hidden', '00000000-0000-0000-0000-000000000c12', 'c1000000-0000-0000-0000-000000000001', 'comment', 'spam')$$)
  like '%notifications_moderation_shape%'
  and test.error_of($$insert into public.notifications (user_id, type, actor_id, content_kind, outcome)
  values ('00000000-0000-0000-0000-000000000c12', 'report_resolved', '00000000-0000-0000-0000-000000000c11', 'reader', 'dismissed')$$)
  like '%notifications_moderation_shape%',
  'a moderation notice can never name anyone (actor_id must stay empty)');

-- 4. A fic hidden on an author's removal request: nobody in the app to tell ------------------------
create temp table before_removal as select count(*) as n from public.notifications;
select test.login('00000000-0000-0000-0000-000000000c1d');
select public.moderation_resolve('removal_request', 'c6000000-0000-0000-0000-000000000001', 'hide');
select test.logout();
select test.ok((select count(*) from public.notifications) = (select n from before_removal),
  'hiding a fic on a removal request notifies nobody (the author has no account; readers aren''t affected content)');

-- 5. What each reader sees -------------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-000000000c11');
select test.ok((select array_agg(row(type::text, content_kind, reason::text, story_title, room_kind::text, section_number, actor_username)::text order by content_kind)
                from public.my_notifications_v2() where type::text = 'content_hidden')
  = array[row('content_hidden', 'comment', 'spam', 'Notice Book', 'chapter', 3, null::text)::text,
          row('content_hidden', 'review', 'spoiler', 'Notice Book', null::text, null::int, null::text)::text],
  'the author sees both notices, about a hidden comment, with the story, chapter and reason');
select test.ok((select count(*) from public.notifications where type::text = 'content_hidden') = 2, 'and can read them from the table');
select test.login('00000000-0000-0000-0000-000000000c12');
select test.ok((select array_agg(row(content_kind, outcome::text, story_title, actor_username)::text order by content_kind)
                from public.my_notifications_v2() where type::text = 'report_resolved')
  = array[row('comment', 'actioned', 'Notice Book', null::text)::text, row('review', 'dismissed', 'Notice Book', null::text)::text],
  'the reporter sees what was decided on each report, though they blocked the author');
select test.login('00000000-0000-0000-0000-000000000c13');
select test.ok((select row(story_id, story_title)::text from public.my_notifications_v2() where content_kind = 'reader')
  = row(null::uuid, null::text)::text, 'a report about a reader has no story');
select test.ok(not exists (select 1 from public.my_notifications_v2(50, array['reply', 'mention']::public.notification_type[])
                           where type::text in ('content_hidden', 'report_resolved')),
  'Home''s replies list does not mix them in');

-- 5b. Old app builds call my_notifications(p_types => null) and can't render the new kinds ----------
select test.login('00000000-0000-0000-0000-000000000c11');
select test.ok((select array_agg(type::text) from public.my_notifications()) = array['reply'],
  'the old my_notifications returns only replies, mentions and reactions, never a moderation notice');
select test.ok((select array_agg(k order by k) from public.my_notifications() x, jsonb_object_keys(to_jsonb(x)) k)
  = array['actor_username', 'comment_id', 'created_at', 'id', 'read_at', 'room_kind', 'section_number', 'story_id', 'story_kind', 'story_title', 'type'],
  'with the same columns as before');
select test.ok((select count(*) from public.my_notifications_v2()) = 3,
  'my_notifications_v2 returns the reply and both notices');
select test.logout();
select test.logout();

-- 6. Never a push -----------------------------------------------------------------------------------
select public.send_held_pushes();
select test.ok((select count(*) from test.notice_pushes) = 1, 'no moderation notice sends a push, at once or held (only the reply did)');
select test.ok(not exists (select 1 from test.notices where pushed_at is not null and type::text in ('content_hidden', 'report_resolved')),
  'and none is marked pushed');

update public.push_settings set enabled = false;
drop function net.http_post(text, jsonb, jsonb);
drop schema net;
\o
\echo 'MODERATION NOTICES PASSED'
