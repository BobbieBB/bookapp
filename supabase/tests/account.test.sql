-- Deleting your account (docs/DECISIONS.md, "Deleting an account: what happens to comments"):
-- comments and reviews stay, anonymised, or are erased on request; everything else goes.
-- Runs after spoiler_rules.test.sql (needs its test schema).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

select test.logout();
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000dd001'), ('00000000-0000-0000-0000-0000000dd002'),
  ('00000000-0000-0000-0000-0000000dd003'), ('00000000-0000-0000-0000-0000000dd004');
insert into public.profiles (id, username) values
  ('00000000-0000-0000-0000-0000000dd001', 'dora'),  -- deletes her account, keeps her comments
  ('00000000-0000-0000-0000-0000000dd002', 'emil'),  -- stays, replies to everyone
  ('00000000-0000-0000-0000-0000000dd003', 'gabi'),  -- deletes her account and erases her comments
  ('00000000-0000-0000-0000-0000000dd004', 'fil');   -- blocked by dora
insert into public.stories (id, kind, language, title, author_name, total_sections, status, created_by) values
  ('a1000000-0000-0000-0000-000000000001', 'book', 'en', 'Gone Book', 'x', 3, 'completed', '00000000-0000-0000-0000-0000000dd001');
insert into public.library_entries (user_id, story_id, status, progress_section) values
  ('00000000-0000-0000-0000-0000000dd001', 'a1000000-0000-0000-0000-000000000001', 'finished', 3),
  ('00000000-0000-0000-0000-0000000dd002', 'a1000000-0000-0000-0000-000000000001', 'currently_reading', 2),
  ('00000000-0000-0000-0000-0000000dd003', 'a1000000-0000-0000-0000-000000000001', 'finished', 3);
insert into public.discussions (id, story_id, kind, section_number) values
  ('a2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'chapter', 2);
insert into public.comments (id, discussion_id, author_id, parent_id, body) values
  ('a3000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000dd001', null, 'Dora on chapter 2'),
  ('a3000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000dd001', null, 'Dora takes it back'),
  ('a3000000-0000-0000-0000-000000000004', 'a2000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000dd003', null, 'Gabi on chapter 2');
insert into public.comments (id, discussion_id, author_id, parent_id, body) values
  ('a3000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000dd002', 'a3000000-0000-0000-0000-000000000001', 'Emil answers Dora'),
  ('a3000000-0000-0000-0000-000000000005', 'a2000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000dd002', 'a3000000-0000-0000-0000-000000000004', 'Emil answers Gabi');
-- Dora deleted one of her comments herself before leaving.
update public.comments set deleted_at = now() where id = 'a3000000-0000-0000-0000-000000000003';
-- Emil last read the chapter a day ago, so everyone else's comments are new to him.
update public.discussion_follows set last_read_at = now() - interval '1 day' where user_id = '00000000-0000-0000-0000-0000000dd002';

insert into public.reviews (user_id, story_id, body) values
  ('00000000-0000-0000-0000-0000000dd001', 'a1000000-0000-0000-0000-000000000001', 'Dora reviews'),
  ('00000000-0000-0000-0000-0000000dd003', 'a1000000-0000-0000-0000-000000000001', 'Gabi reviews');
insert into public.ratings (user_id, story_id, rating) values
  ('00000000-0000-0000-0000-0000000dd001', 'a1000000-0000-0000-0000-000000000001', 4),
  ('00000000-0000-0000-0000-0000000dd002', 'a1000000-0000-0000-0000-000000000001', 2);
insert into public.custom_covers (user_id, story_id, path) values
  ('00000000-0000-0000-0000-0000000dd001', 'a1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000dd001/x.jpg');
insert into public.reactions (comment_id, user_id, emoji) values
  ('a3000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000dd001', '❤️'),
  ('a3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000dd002', '🔥');
insert into public.blocks (blocker_id, blocked_id) values ('00000000-0000-0000-0000-0000000dd001', '00000000-0000-0000-0000-0000000dd004');
insert into public.analytics_events (user_id, name) values ('00000000-0000-0000-0000-0000000dd001', 'app_open');
insert into public.analytics_opt_outs (user_id) values ('00000000-0000-0000-0000-0000000dd001');
insert into public.push_tokens (token, user_id, language, platform) values
  ('ExponentPushToken[dora]', '00000000-0000-0000-0000-0000000dd001', 'en', 'ios');
insert into public.reports (reporter_id, comment_id, reason) values
  ('00000000-0000-0000-0000-0000000dd001', 'a3000000-0000-0000-0000-000000000002', 'spoiler');
insert into public.feedback (user_id, kind, body) values ('00000000-0000-0000-0000-0000000dd001', 'idea', 'More books');
insert into public.removal_requests (requester_id, story_url, contact) values ('00000000-0000-0000-0000-0000000dd001', 'https://archiveofourown.org/works/1', 'dora@example.test');

-- 1. Who can call it ---------------------------------------------------------------
select test.ok(not has_function_privilege('anon', 'public.delete_my_account(boolean)', 'execute'),
  'signed-out visitors cannot call delete_my_account');
select test.ok(has_function_privilege('authenticated', 'public.delete_my_account(boolean)', 'execute'),
  'signed-in readers can call delete_my_account');
select set_config('request.jwt.claim.sub', '', false), set_config('role', 'authenticated', false);
select test.ok(test.error_of($$select public.delete_my_account(false)$$) like '%not signed in%',
  'without a signed-in reader it refuses');
select test.logout();
select test.ok((select count(*) from auth.users where id::text like '00000000-0000-0000-0000-0000000dd00_') = 4,
  'nobody was deleted by the refused call');

-- A reader cannot anonymise their own comment by hand.
select test.login('00000000-0000-0000-0000-0000000dd001');
select test.ok(test.error_of($$update public.comments set author_id = null where id = 'a3000000-0000-0000-0000-000000000001'$$) is not null,
  'the author of a comment cannot be changed, not even to nobody');

-- Before: Emil has 2 new comments from others in chapter 2 (Dora's live one and Gabi's).
select test.login('00000000-0000-0000-0000-0000000dd002');
select test.ok((select new_comments from public.continue_reading_hints() where story_id = 'a1000000-0000-0000-0000-000000000001') = 2,
  'before: 2 new comments for Emil');

-- 2. Dora deletes her account and keeps her comments --------------------------------
select test.login('00000000-0000-0000-0000-0000000dd001');
select public.delete_my_account(false);
select test.logout();

select test.ok(not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000dd001'), 'the account is gone');
select test.ok(not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000dd001'), 'the profile is gone');
select test.ok((select author_id is null and body = 'Dora on chapter 2' and deleted_at is null from public.comments
  where id = 'a3000000-0000-0000-0000-000000000001'), 'her comment stays with its text, without an author');
select test.ok((select author_id is null and deleted_at is not null from public.comments
  where id = 'a3000000-0000-0000-0000-000000000003'), 'a comment she had deleted herself stays deleted, without an author');
select test.ok((select parent_id = 'a3000000-0000-0000-0000-000000000001' from public.comments
  where id = 'a3000000-0000-0000-0000-000000000002'), 'the reply to her comment stays in its thread');
select test.ok((select user_id is null and body = 'Dora reviews' from public.reviews where body = 'Dora reviews'),
  'her review stays, without an author');
select test.ok(not exists (select 1 from public.library_entries where user_id = '00000000-0000-0000-0000-0000000dd001'), 'library and progress are gone');
select test.ok(not exists (select 1 from public.ratings where user_id = '00000000-0000-0000-0000-0000000dd001'), 'ratings are gone');
select test.ok((select ratings_count = 1 from public.book_rating_stats where story_id = 'a1000000-0000-0000-0000-000000000001'),
  'her rating no longer counts in the average');
select test.ok(not exists (select 1 from public.reactions where user_id = '00000000-0000-0000-0000-0000000dd001'), 'reactions are gone');
select test.ok(not exists (select 1 from public.discussion_follows where user_id = '00000000-0000-0000-0000-0000000dd001'), 'follows are gone');
select test.ok(not exists (select 1 from public.blocks where blocker_id = '00000000-0000-0000-0000-0000000dd001'), 'blocks are gone');
select test.ok(not exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-0000000dd001'), 'notifications are gone');
select test.ok(not exists (select 1 from public.custom_covers where user_id = '00000000-0000-0000-0000-0000000dd001'), 'custom covers are gone');
select test.ok(not exists (select 1 from public.analytics_events where user_id = '00000000-0000-0000-0000-0000000dd001'), 'analytics events are gone');
select test.ok(not exists (select 1 from public.analytics_opt_outs where user_id = '00000000-0000-0000-0000-0000000dd001'), 'the analytics opt-out is gone');
select test.ok(not exists (select 1 from public.push_tokens where user_id = '00000000-0000-0000-0000-0000000dd001'), 'push tokens are gone');
select test.ok(not exists (select 1 from public.reports where reporter_id = '00000000-0000-0000-0000-0000000dd001'), 'her reports are gone');
select test.ok((select created_by is null from public.stories where id = 'a1000000-0000-0000-0000-000000000001'),
  'a story she added stays for its other readers, without a creator');
select test.ok((select user_id is null from public.feedback where body = 'More books'), 'feedback stays, anonymised');
select test.ok((select requester_id is null from public.removal_requests where story_url = 'https://archiveofourown.org/works/1'),
  'a removal request stays, anonymised');
select test.ok(exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000dd004'), 'the reader she blocked is untouched');

-- 3. Other readers still see and count her comments ---------------------------------
select test.login('00000000-0000-0000-0000-0000000dd002');
select test.ok(exists (select 1 from public.comments where id = 'a3000000-0000-0000-0000-000000000001'),
  'other readers still see her comment');
select test.ok(exists (select 1 from public.reviews where body = 'Dora reviews'), 'other readers still see her review');
select test.ok((select new_comments from public.continue_reading_hints() where story_id = 'a1000000-0000-0000-0000-000000000001') = 2,
  'her comment still counts in Emil''s "new comments"');
select test.ok(test.error_of($$insert into public.comments (discussion_id, parent_id, body)
  values ('a2000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000001', 'Still replying')$$) is null,
  'others can still reply to her comment');
select test.ok(test.error_of($$insert into public.reactions (comment_id, emoji) values ('a3000000-0000-0000-0000-000000000001', '😂')$$) is null,
  'others can still react to her comment');
select test.ok(test.error_of($$insert into public.reports (comment_id, reason) values ('a3000000-0000-0000-0000-000000000001', 'harassment')$$) is null,
  'others can still report her comment');
select test.ok(test.error_of($$insert into public.reports (review_id, reason)
  select id, 'harassment' from public.reviews where body = 'Dora reviews'$$) is null,
  'others can still report her review');
select test.logout();
select test.ok((select comments from public.comments_per_story_since(now() - interval '1 day')
  where story_id = 'a1000000-0000-0000-0000-000000000001') = 5,
  'Discover still counts her comment (5 live comments; the deleted one does not count)');

-- 4. Gabi deletes her account and erases her comments --------------------------------
select test.login('00000000-0000-0000-0000-0000000dd003');
select public.delete_my_account(true);
select test.logout();

select test.ok(not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000dd003'), 'her account is gone');
select test.ok((select author_id is null and deleted_at is not null and body <> 'Gabi on chapter 2' from public.comments
  where id = 'a3000000-0000-0000-0000-000000000004'), 'her comment is erased, and keeps its place');
select test.ok((select parent_id = 'a3000000-0000-0000-0000-000000000004' from public.comments
  where id = 'a3000000-0000-0000-0000-000000000005'), 'the reply to her erased comment stays in its thread');
select test.ok(not exists (select 1 from public.reviews where body = 'Gabi reviews'), 'her review is erased');
select test.ok((select body = 'Dora on chapter 2' from public.comments where id = 'a3000000-0000-0000-0000-000000000001'),
  'erasing touches only her own comments');
select test.login('00000000-0000-0000-0000-0000000dd002');
select test.ok(exists (select 1 from public.comments where id = 'a3000000-0000-0000-0000-000000000004'),
  'other readers still see where her comment was');

select test.logout();
\o
\echo 'ACCOUNT DELETION RULES PASSED'
