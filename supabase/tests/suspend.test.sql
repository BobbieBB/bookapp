-- Suspending a reader (docs/DECISIONS.md, "Suspending a reader"): only admins, with a reason, logged;
-- the reader is told in the app (never by push), can still read, delete and send feedback, but cannot
-- post, react or report until it is lifted. Runs after spoiler_rules.test.sql (needs its test schema).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

-- the SQLSTATE of the error `sql` raises, or null if it succeeded
create or replace function test.code_of(sql text) returns text language plpgsql as $$
begin
  execute sql;
  return null;
exception when others then
  return sqlstate;
end $$;
grant execute on all functions in schema test to authenticated, anon;

select test.logout();
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000005e1'), ('00000000-0000-0000-0000-0000000005e2'),
  ('00000000-0000-0000-0000-0000000005ea');
insert into public.profiles (id, username, is_admin) values
  ('00000000-0000-0000-0000-0000000005e1', 'sam', false),    -- the reader who gets suspended
  ('00000000-0000-0000-0000-0000000005e2', 'sid', false),    -- another reader, writes a comment and a review
  ('00000000-0000-0000-0000-0000000005ea', 'sadmin', true);
insert into public.stories (id, kind, language, title, author_name, has_chapters, total_sections, status) values
  ('e1000000-0000-0000-0000-000000000001', 'book', 'en', 'Suspense Book', 'x', true, 10, 'completed'),
  ('e1000000-0000-0000-0000-000000000002', 'book', 'en', 'Other Suspense Book', 'x', true, 10, 'completed');
insert into public.library_entries (user_id, story_id, status, progress_section) values
  ('00000000-0000-0000-0000-0000000005e1', 'e1000000-0000-0000-0000-000000000001', 'finished', 10),
  ('00000000-0000-0000-0000-0000000005e2', 'e1000000-0000-0000-0000-000000000001', 'finished', 10);
insert into public.discussions (id, story_id, kind, section_number) values
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'chapter', 1);
insert into public.comments (id, discussion_id, author_id, body) values
  ('e3000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000005e2', 'sid says hi'),
  ('e3000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000005e1', 'sam wrote this'),
  ('e3000000-0000-0000-0000-000000000003', 'e2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000005e1', 'sam wrote this too');
insert into public.reviews (id, user_id, story_id, body) values
  ('e4000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000005e2', 'e1000000-0000-0000-0000-000000000001', 'sid review'),
  ('e4000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000005e1', 'e1000000-0000-0000-0000-000000000001', 'sam review');
insert into public.ratings (user_id, story_id, rating) values
  ('00000000-0000-0000-0000-0000000005e1', 'e1000000-0000-0000-0000-000000000001', 3);

-- Only admins -------------------------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-0000000005e2');
select test.ok(test.code_of($$select public.set_reader_suspended('00000000-0000-0000-0000-0000000005e1', true, 'spam')$$) = '42501',
  'a reader cannot suspend anyone');
select test.ok(not (select is_suspended from public.profiles where id = '00000000-0000-0000-0000-0000000005e1'), '... and nothing changed');
select test.ok(test.code_of($$select public.set_reader_suspended('00000000-0000-0000-0000-0000000005e2', false, null)$$) = '42501',
  'a reader cannot lift a suspension either');
select test.ok(test.code_of($$insert into public.suspensions (user_id, suspended, reason) values ('00000000-0000-0000-0000-0000000005e1', true, 'x')$$) is not null,
  'a reader cannot write the suspension log');
select test.ok(test.code_of($$update public.profiles set is_suspended = true where id = auth.uid()$$) is not null,
  'a reader still cannot set the flag on their own profile');

-- Reason required, at most 500 characters; never yourself ------------------------------------------
select test.login('00000000-0000-0000-0000-0000000005ea');
select test.ok(test.code_of($$select public.set_reader_suspended('00000000-0000-0000-0000-0000000005e1', true, null)$$) = '22023',
  'suspending needs a reason');
select test.ok(test.code_of($$select public.set_reader_suspended('00000000-0000-0000-0000-0000000005e1', true, '   ')$$) = '22023',
  'a blank reason is no reason');
select test.ok(test.code_of(format('select public.set_reader_suspended(%L, true, %L)', '00000000-0000-0000-0000-0000000005e1', repeat('x', 501))) = '22001',
  'a reason of more than 500 characters is refused');
select test.ok(test.code_of($$select public.set_reader_suspended('00000000-0000-0000-0000-0000000005ea', true, 'oops')$$) = '22023',
  'an admin cannot suspend themselves');
select test.ok(test.code_of($$select public.set_reader_suspended('00000000-0000-0000-0000-0000000005ff', true, 'nobody')$$) = 'P0002',
  'an unknown reader is refused');
select test.ok(not (select is_suspended from public.profiles where id = '00000000-0000-0000-0000-0000000005e1'), 'none of these suspended anyone');

select public.set_reader_suspended('00000000-0000-0000-0000-0000000005e1', true, '  Repeated spoilers in chapter rooms  ');
select test.ok((select is_suspended from public.profiles where id = '00000000-0000-0000-0000-0000000005e1'), 'an admin suspends a reader');
select test.ok((select count(*) from public.suspensions where user_id = '00000000-0000-0000-0000-0000000005e1') = 1
  and (select suspended and reason = 'Repeated spoilers in chapter rooms' and by_admin = '00000000-0000-0000-0000-0000000005ea'
              and created_at is not null
       from public.suspensions where user_id = '00000000-0000-0000-0000-0000000005e1'),
  'the log records who, when and the (trimmed) reason');
select test.ok(test.code_of($$select public.set_reader_suspended('00000000-0000-0000-0000-0000000005e1', true, 'again')$$) = '55000',
  'suspending a suspended reader again is refused');

-- The reader is told in the app, never by push ----------------------------------------------------
select test.login('00000000-0000-0000-0000-0000000005e1');
select test.ok((select count(*) from public.my_notifications() where type = 'account_suspended') = 1,
  'the reader gets an account_suspended notification');
select test.ok((select reason from public.my_notifications() where type = 'account_suspended') = 'Repeated spoilers in chapter rooms',
  '... carrying the reason');
select test.ok((select actor_username is null and story_id is null from public.my_notifications() where type = 'account_suspended'),
  '... and naming no admin and no story');
select test.ok((select suspended and reason = 'Repeated spoilers in chapter rooms' and since is not null from public.my_suspension()),
  'my_suspension says so, with the reason');
select test.ok(test.code_of($$select * from public.suspensions$$) is null and (select count(*) from public.suspensions) = 0,
  'the log itself is for admins only');
select test.logout();
select test.ok(public.push_messages((select id from public.notifications where user_id = '00000000-0000-0000-0000-0000000005e1' and type = 'account_suspended')) = '[]'::jsonb,
  'an account_suspended notification makes no push message');
select test.ok((select pushed_at is null from public.notifications where user_id = '00000000-0000-0000-0000-0000000005e1' and type = 'account_suspended'),
  '... and was never pushed');

-- What a suspended reader can no longer do --------------------------------------------------------
select test.login('00000000-0000-0000-0000-0000000005e1');
select test.ok(test.code_of($$insert into public.comments (discussion_id, body) values ('e2000000-0000-0000-0000-000000000001', 'still here')$$) = '42501',
  'a suspended reader cannot comment');
select test.ok(test.code_of($$update public.comments set body = 'edited' where id = 'e3000000-0000-0000-0000-000000000002'$$) = '42501',
  'a suspended reader cannot edit their comment');
select test.ok(test.code_of($$insert into public.reactions (comment_id, emoji) values ('e3000000-0000-0000-0000-000000000001', '🔥')$$) = '42501',
  'a suspended reader cannot react');
select test.ok(test.code_of($$insert into public.reviews (story_id, body) values ('e1000000-0000-0000-0000-000000000002', 'nope')$$) = '42501',
  'a suspended reader cannot write a review');
select test.ok(test.code_of($$insert into public.ratings (story_id, rating) values ('e1000000-0000-0000-0000-000000000002', 4)$$) = '42501',
  'a suspended reader cannot rate');
select test.ok(test.code_of($$insert into public.reports (comment_id, reason) values ('e3000000-0000-0000-0000-000000000001', 'spam')$$) = '42501',
  'a suspended reader cannot report');
select test.ok(test.code_of($$insert into public.stories (kind, language, title, author_name, has_chapters, total_sections) values ('book', 'en', 'New', 'x', true, 3)$$) = '42501',
  'a suspended reader cannot add a story');
select test.ok(test.code_of($$update public.profiles set username = 'sam_renamed' where id = auth.uid()$$) is not null,
  'a suspended reader cannot change their public name');
select test.ok(test.code_of($$update public.profiles set display_name = 'Abuse' where id = auth.uid()$$) is not null,
  '... nor their display name');

-- What they still can do ----------------------------------------------------------------------------
select test.ok((select count(*) from public.comments where discussion_id = 'e2000000-0000-0000-0000-000000000001') = 3,
  'a suspended reader still reads the room');
select test.ok((select count(*) from public.reviews where story_id = 'e1000000-0000-0000-0000-000000000001') = 2,
  '... and the reviews');
select test.ok(test.code_of($$insert into public.feedback (kind, body) values ('problem', 'I think my suspension is a mistake')$$) is null,
  'a suspended reader can still send feedback (the way to contest it)');
select test.ok(test.code_of($$insert into public.library_entries (story_id, status) values ('e1000000-0000-0000-0000-000000000002', 'want_to_read')$$) is null,
  'a suspended reader can still keep their library');
select test.ok(test.code_of($$update public.library_entries set progress_section = 5, status = 'currently_reading' where story_id = 'e1000000-0000-0000-0000-000000000001' and user_id = auth.uid()$$) is null,
  '... and move their progress');
select test.ok(test.code_of($$insert into public.discussion_follows (discussion_id) values ('e2000000-0000-0000-0000-000000000001') on conflict do nothing$$) is null,
  '... and follow a room');
select test.ok(test.code_of($$insert into public.blocks (blocked_id) values ('00000000-0000-0000-0000-0000000005e2')$$) is null,
  '... and block someone');
select test.ok(test.code_of($$update public.comments set deleted_at = now() where id = 'e3000000-0000-0000-0000-000000000002'$$) is null
  and (select body from public.comments where id = 'e3000000-0000-0000-0000-000000000002') = '[deleted]',
  'a suspended reader can still delete their comment');
select test.ok(test.code_of($$update public.comments set deleted_at = now(), body = 'sneaky' where id = 'e3000000-0000-0000-0000-000000000003'$$) is null
  and (select body from public.comments where id = 'e3000000-0000-0000-0000-000000000003') = '[deleted]',
  '... and deleting never lets new text through');
select test.ok(test.code_of($$delete from public.reviews where id = 'e4000000-0000-0000-0000-000000000002'$$) is null
  and not exists (select 1 from public.reviews where id = 'e4000000-0000-0000-0000-000000000002'),
  '... and their review');
select test.ok(test.code_of($$delete from public.ratings where user_id = auth.uid()$$) is null
  and not exists (select 1 from public.ratings where user_id = '00000000-0000-0000-0000-0000000005e1'),
  '... and their rating');
select test.ok(test.code_of($$select public.mark_notifications_read(now())$$) is null, '... and mark notifications read');

-- Lifting it --------------------------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-0000000005ea');
select test.ok(test.code_of($$select public.set_reader_suspended('00000000-0000-0000-0000-0000000005e2', false, null)$$) = '55000',
  'lifting a suspension nobody has is refused');
select public.set_reader_suspended('00000000-0000-0000-0000-0000000005e1', false, null);
select test.ok(not (select is_suspended from public.profiles where id = '00000000-0000-0000-0000-0000000005e1'), 'an admin lifts it');
select test.ok((select count(*) from public.suspensions where user_id = '00000000-0000-0000-0000-0000000005e1' and not suspended
                and by_admin = '00000000-0000-0000-0000-0000000005ea') = 1, 'the lifting is logged too');
select test.login('00000000-0000-0000-0000-0000000005e1');
select test.ok((select count(*) from public.my_notifications() where type = 'account_restored') = 1,
  'the reader gets an account_restored notification');
select test.ok((select not suspended and reason is null from public.my_suspension()), 'my_suspension says it is over');
select test.ok(test.code_of($$insert into public.comments (discussion_id, body) values ('e2000000-0000-0000-0000-000000000001', 'back')$$) is null,
  'and they can comment again');
select test.logout();
select test.ok(public.push_messages((select id from public.notifications where user_id = '00000000-0000-0000-0000-0000000005e1' and type = 'account_restored')) = '[]'::jsonb,
  'account_restored makes no push message either');

-- The moderation queue says who a report is about and whether they are suspended -------------------
select test.login('00000000-0000-0000-0000-0000000005e1');
insert into public.reports (id, comment_id, reason) values ('e5000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 'spam');
insert into public.reports (id, reported_user_id, reason) values ('e5000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000005e2', 'harassment');
select test.login('00000000-0000-0000-0000-0000000005ea');
select public.set_reader_suspended('00000000-0000-0000-0000-0000000005e2', true, 'Harassment');
select test.ok((select subject_id = '00000000-0000-0000-0000-0000000005e2' and subject_suspended
                from public.moderation_queue() where id = 'e5000000-0000-0000-0000-000000000001'),
  'a comment report names its author and says they are suspended');
select test.ok((select subject_id = '00000000-0000-0000-0000-0000000005e2' and subject_suspended
                from public.moderation_queue() where id = 'e5000000-0000-0000-0000-000000000002'),
  'so does a report about a reader');
-- leave the queue as other files expect it
update public.reports set status = 'dismissed' where id in ('e5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000002');
select public.set_reader_suspended('00000000-0000-0000-0000-0000000005e2', false, null);

select test.logout();
\o
\echo 'SUSPEND PASSED'
