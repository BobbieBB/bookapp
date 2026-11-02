-- The moderation queue and chapter-count requests (docs/DECISIONS.md: Moderation in v1).
-- Runs after spoiler_rules.test.sql (needs its test schema).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null


-- the queue, minus open items other test files left behind (this file's ids start 5c to 5f)
create view test.mq as select * from public.moderation_queue() where id::text ~ '^5[c-f]000000-';
grant select on test.mq to authenticated;

-- the SQLSTATE of the error `sql` raises, or null if it succeeded
create function test.state_of(sql text) returns text language plpgsql as $$
begin
  execute sql;
  return null;
exception when others then
  return sqlstate;
end $$;
grant execute on all functions in schema test to authenticated, anon;

select test.logout();
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000008a1'), ('00000000-0000-0000-0000-0000000008a2'), ('00000000-0000-0000-0000-0000000008a3'),
  ('00000000-0000-0000-0000-0000000008a4'), ('00000000-0000-0000-0000-0000000008ad'), ('00000000-0000-0000-0000-0000000008a5');
insert into public.profiles (id, username, is_admin, is_suspended) values
  ('00000000-0000-0000-0000-0000000008a1', 'mona', false, false),   -- reader, reports things, asks for a count
  ('00000000-0000-0000-0000-0000000008a2', 'milo', false, false),   -- reader, writes the comment and the review
  ('00000000-0000-0000-0000-0000000008a3', 'mira', false, false),   -- second reporter, a reader at chapter 9
  ('00000000-0000-0000-0000-0000000008a4', 'max', false, true),     -- suspended
  ('00000000-0000-0000-0000-0000000008a5', 'moe', false, false),    -- has no library entry
  ('00000000-0000-0000-0000-0000000008ad', 'madmin', true, false);
insert into public.stories (id, kind, language, title, author_name, has_chapters, total_sections, status, source_url) values
  ('58000000-0000-0000-0000-000000000001', 'book', 'en', 'Counted Book', 'x', true, 10, 'completed', null),
  ('58000000-0000-0000-0000-000000000002', 'book', 'en', 'Uncounted Book', 'x', true, null, 'completed', null),
  ('58000000-0000-0000-0000-000000000003', 'fanfic', 'en', 'A Fic', 'x', true, null, 'ongoing', 'https://archiveofourown.org/works/8003'),
  ('58000000-0000-0000-0000-000000000004', 'book', 'en', 'Other Book', 'x', true, 20, 'completed', null),
  ('58000000-0000-0000-0000-000000000005', 'fanfic', 'en', 'Removable Fic', 'x', true, null, 'ongoing', 'https://archiveofourown.org/works/8005');
insert into public.library_entries (user_id, story_id, status, progress_section) values
  ('00000000-0000-0000-0000-0000000008a1', '58000000-0000-0000-0000-000000000001', 'currently_reading', 1),
  ('00000000-0000-0000-0000-0000000008a2', '58000000-0000-0000-0000-000000000001', 'finished', 10),
  ('00000000-0000-0000-0000-0000000008a3', '58000000-0000-0000-0000-000000000001', 'currently_reading', 9),
  ('00000000-0000-0000-0000-0000000008a1', '58000000-0000-0000-0000-000000000002', 'want_to_read', 0),
  ('00000000-0000-0000-0000-0000000008a1', '58000000-0000-0000-0000-000000000003', 'want_to_read', 0),
  ('00000000-0000-0000-0000-0000000008a4', '58000000-0000-0000-0000-000000000001', 'want_to_read', 0),
  ('00000000-0000-0000-0000-0000000008a1', '58000000-0000-0000-0000-000000000004', 'want_to_read', 0);
insert into public.discussions (id, story_id, kind, section_number) values
  ('59000000-0000-0000-0000-000000000001', '58000000-0000-0000-0000-000000000001', 'chapter', 1);
insert into public.comments (id, discussion_id, author_id, body) values
  ('5a000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000008a2', repeat('long ', 100)),
  ('5a000000-0000-0000-0000-000000000002', '59000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000008a2', 'fine comment');
insert into public.reviews (id, user_id, story_id, body) values
  ('5b000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000008a2', '58000000-0000-0000-0000-000000000001', 'bad review');

-- Reports, a removal request and a feedback message from readers.
select test.login('00000000-0000-0000-0000-0000000008a1');
insert into public.reports (id, comment_id, reason, details) values
  ('5c000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'spam', 'ads'),
  ('5c000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-000000000002', 'other', null);
insert into public.reports (id, review_id, reason) values ('5c000000-0000-0000-0000-000000000003', '5b000000-0000-0000-0000-000000000001', 'harassment');
insert into public.reports (id, reported_user_id, reason) values ('5c000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000008a2', 'harassment');
insert into public.removal_requests (id, story_id, story_url, contact, message) values
  ('5d000000-0000-0000-0000-000000000001', '58000000-0000-0000-0000-000000000005', 'https://archiveofourown.org/works/8005', 'a@b.co', 'please hide'),
  ('5d000000-0000-0000-0000-000000000002', null, 'https://archiveofourown.org/works/8999', 'a@b.co', 'not here yet'),
  ('5d000000-0000-0000-0000-000000000003', null, 'https://archiveofourown.org/works/8003', 'a@b.co', 'added later');
insert into public.feedback (id, kind, body) values
  ('5e000000-0000-0000-0000-000000000001', 'idea', 'dark mode'),
  ('5e000000-0000-0000-0000-000000000002', 'problem', 'crash');
select test.login('00000000-0000-0000-0000-0000000008a3');
insert into public.reports (id, comment_id, reason) values ('5c000000-0000-0000-0000-000000000005', '5a000000-0000-0000-0000-000000000001', 'spam');

-- 1. Chapter-count requests: every insert rule -------------------------------------
select test.login('00000000-0000-0000-0000-0000000008a1');
insert into public.chapter_count_requests (id, story_id, proposed) values
  ('5f000000-0000-0000-0000-000000000001', '58000000-0000-0000-0000-000000000001', 12);
select test.ok((select requester_id from public.chapter_count_requests where id = '5f000000-0000-0000-0000-000000000001')
  = '00000000-0000-0000-0000-0000000008a1' and (select status from public.chapter_count_requests where id = '5f000000-0000-0000-0000-000000000001') = 'open',
  'a reader with the counted book asks for a different count; it starts open');
select test.ok(test.error_of($$insert into public.chapter_count_requests (story_id, proposed) values ('58000000-0000-0000-0000-000000000001', 14)$$)
  like '%duplicate key%chapter_count_one_open%', 'one open request per reader and book');
select test.ok(test.error_of($$insert into public.chapter_count_requests (story_id, proposed) values ('58000000-0000-0000-0000-000000000004', 20)$$)
  like '%row-level security%', 'the same count as now is refused');
select test.ok(test.error_of($$insert into public.chapter_count_requests (story_id, proposed) values ('58000000-0000-0000-0000-000000000004', 0)$$)
  like '%chapter_count_requests_proposed_check%', 'a count below 1 is refused');
select test.ok(test.error_of($$insert into public.chapter_count_requests (story_id, proposed) values ('58000000-0000-0000-0000-000000000004', 5001)$$)
  like '%chapter_count_requests_proposed_check%', 'a count above 5000 is refused');
select test.ok(test.error_of($$insert into public.chapter_count_requests (story_id, proposed) values ('58000000-0000-0000-0000-000000000002', 5)$$)
  like '%row-level security%', 'a book with no count yet is set with set_book_chapter_count, not asked about');
select test.ok(test.error_of($$insert into public.chapter_count_requests (story_id, proposed) values ('58000000-0000-0000-0000-000000000003', 5)$$)
  like '%row-level security%', 'a fic is not a book');
select test.ok(test.error_of($$insert into public.chapter_count_requests (story_id, requester_id, proposed) values ('58000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000008a2', 5)$$)
  like '%row-level security%', 'a request cannot be filed in someone else''s name');
select test.login('00000000-0000-0000-0000-0000000008a5');
select test.ok(test.error_of($$insert into public.chapter_count_requests (story_id, proposed) values ('58000000-0000-0000-0000-000000000004', 5)$$)
  like '%row-level security%', 'a reader without the book in their library is refused');
select test.login('00000000-0000-0000-0000-0000000008a4');
select test.ok(test.error_of($$insert into public.chapter_count_requests (story_id, proposed) values ('58000000-0000-0000-0000-000000000001', 5)$$)
  like '%row-level security%', 'a suspended reader is refused');
select test.ok((select count(*) from public.chapter_count_requests) = 0, 'readers do not see others'' requests');
select test.login('00000000-0000-0000-0000-0000000008a1');
select test.ok((select count(*) from public.chapter_count_requests) = 1, 'you see your own requests');
select test.ok(test.error_of($$update public.chapter_count_requests set status = 'actioned'$$) like 'permission denied%'
  and (select status from public.chapter_count_requests) = 'open', 'a reader cannot resolve a request');
select test.ok(test.error_of($$delete from public.chapter_count_requests$$) like 'permission denied%'
  and (select count(*) from public.chapter_count_requests) = 1, 'a reader cannot delete a request');
select test.ok(test.error_of($$insert into public.feedback (kind, body, status) values ('idea', 'sneaky', 'dismissed')$$) like '%row-level security%',
  'feedback starts open');
select test.ok(test.error_of($$update public.feedback set status = 'actioned'$$) is null
  and (select count(*) from public.feedback where id::text like '5e000000-%' and status = 'open') = 2, 'a reader cannot resolve feedback');

select test.logout();
-- mira has 10 more counted books, for the rate limit
insert into public.stories (id, kind, language, title, author_name, has_chapters, total_sections, status)
  select ('58100000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 'book', 'en', 'Rate ' || n, 'x', true, 5, 'completed' from generate_series(1, 11) n;
insert into public.library_entries (user_id, story_id, status)
  select '00000000-0000-0000-0000-0000000008a3', id, 'want_to_read' from public.stories where title like 'Rate %';

select test.login('00000000-0000-0000-0000-0000000008a3');
insert into public.chapter_count_requests (id, story_id, proposed) values ('5f000000-0000-0000-0000-000000000002', '58000000-0000-0000-0000-000000000001', 8);
select test.ok(test.error_of($$insert into public.chapter_count_requests (story_id, proposed) select id, 6 from public.stories where title like 'Rate %'$$)
  like 'too many chapter_count_requests%', 'at most 10 chapter-count requests a day');
select test.ok((select count(*) from public.chapter_count_requests) = 1, 'the refused batch left nothing behind');

-- 2. Only admins use the queue ------------------------------------------------------
select test.login('00000000-0000-0000-0000-0000000008a1');
select test.ok(test.error_of($$select * from public.moderation_queue()$$) = 'only admins can see the moderation queue', 'a reader cannot read the queue');
select test.ok(test.state_of($$select * from public.moderation_queue()$$) = '42501', '... with 42501');
select test.ok(test.error_of($$select public.moderation_resolve('feedback', '5e000000-0000-0000-0000-000000000001', 'done')$$) = 'only admins can resolve moderation items',
  'a reader cannot resolve');
select test.ok(test.state_of($$select public.moderation_resolve('feedback', '5e000000-0000-0000-0000-000000000001', 'done')$$) = '42501', '... with 42501');
select test.ok((select status from public.feedback where id = '5e000000-0000-0000-0000-000000000001') = 'open', 'and nothing changed');
select set_config('role', 'anon', false);
select test.ok(test.error_of($$select * from public.moderation_queue()$$) like 'permission denied%', 'a logged-out caller cannot even call the queue');
select test.ok(test.error_of($$select public.moderation_resolve('feedback', '5e000000-0000-0000-0000-000000000001', 'done')$$) like 'permission denied%', 'nor resolve');

-- 3. The queue lists every kind with the right fields -------------------------------
select test.login('00000000-0000-0000-0000-0000000008ad');
select test.ok((select count(*) from test.mq) = 12, 'all 12 open items are listed');
select test.ok((select array_agg(kind order by kind) from (select distinct kind from test.mq) k)
  = array['chapter_count','comment_report','feedback','removal_request','review_report','user_report'], 'every kind is there');
select test.ok((select array_agg(created_at order by ord) from (select created_at, row_number() over () as ord from test.mq) q)
  = (select array_agg(created_at order by created_at desc) from test.mq), 'newest first');
select test.ok((select length(excerpt) from test.mq where id = '5c000000-0000-0000-0000-000000000001') = 281
  and (select excerpt from test.mq where id = '5c000000-0000-0000-0000-000000000001') like 'long long %…',
  'a long comment is cut to 280 characters and an ellipsis');
select test.ok((select excerpt from test.mq where id = '5c000000-0000-0000-0000-000000000002') = 'fine comment', 'a short comment is whole');
select test.ok((select (kind, story_id, story_title, subject, reason, details, reporter_count)::text from test.mq where id = '5c000000-0000-0000-0000-000000000001')
  = '(comment_report,58000000-0000-0000-0000-000000000001,"Counted Book",milo,spam,ads,2)', 'a comment report shows story, author, reason, details and how many readers reported it');
select test.ok((select (kind, subject, excerpt, reporter_count)::text from test.mq where id = '5c000000-0000-0000-0000-000000000003')
  = '(review_report,milo,"bad review",1)', 'a review report shows the review');
select test.ok((select (kind, subject, story_id, excerpt, reporter_count)::text from test.mq where id = '5c000000-0000-0000-0000-000000000004')
  = '(user_report,milo,,,1)', 'a user report names the reader');
select test.ok((select (kind, story_id, story_title, story_url, contact, excerpt)::text from test.mq where id = '5d000000-0000-0000-0000-000000000001')
  = '(removal_request,58000000-0000-0000-0000-000000000005,"Removable Fic",https://archiveofourown.org/works/8005,a@b.co,"please hide")', 'a removal request shows the fic, link, contact and message');
select test.ok((select story_id is null and story_title is null and story_url = 'https://archiveofourown.org/works/8999' from test.mq where id = '5d000000-0000-0000-0000-000000000002'),
  'a removal request for a fic we do not have has no story, only its link');
select test.ok((select (kind, reason, excerpt)::text from test.mq where id = '5e000000-0000-0000-0000-000000000001') = '(feedback,idea,"dark mode")',
  'feedback shows its kind as the reason and its message');
select test.ok((select (kind, story_title, current_count, proposed_count, subject)::text from test.mq where id = '5f000000-0000-0000-0000-000000000001')
  = '(chapter_count,"Counted Book",10,12,mona)', 'a chapter-count request shows current and proposed counts and who asked');

-- 4. Resolving: errors ---------------------------------------------------------------
select test.ok(test.error_of($$select public.moderation_resolve('nonsense', '5e000000-0000-0000-0000-000000000001', 'done')$$) = 'unknown moderation kind: nonsense', 'unknown kind');
select test.ok(test.error_of($$select public.moderation_resolve('feedback', '5e000000-0000-0000-0000-000000000001', 'hide')$$) = 'feedback cannot be hide', 'an action the kind does not have');
select test.ok(test.error_of($$select public.moderation_resolve('user_report', '5c000000-0000-0000-0000-000000000004', 'hide')$$) = 'user_report cannot be hide',
  'user reports are dismissed only');
select test.ok(test.error_of($$select public.moderation_resolve('feedback', '5e0000ff-0000-0000-0000-000000000001', 'done')$$) = 'moderation item not found', 'missing id');
select test.ok(test.error_of($$select public.moderation_resolve('feedback', '5c000000-0000-0000-0000-000000000001', 'done')$$) = 'moderation item not found',
  'an id of another kind is not found');
select test.ok(test.error_of($$select public.moderation_resolve(null, null, null)$$) = 'unknown moderation kind: <none>', 'nulls');

-- 5. Comment and review reports -----------------------------------------------------
select public.moderation_resolve('comment_report', '5c000000-0000-0000-0000-000000000001', 'hide');
select test.ok((select is_hidden from public.comments where id = '5a000000-0000-0000-0000-000000000001'), 'hide hides the comment');
select test.ok((select array_agg(status::text order by id) from public.reports where comment_id = '5a000000-0000-0000-0000-000000000001') = array['actioned','actioned'],
  'every open report on that comment is actioned');
select test.ok((select status from public.reports where id = '5c000000-0000-0000-0000-000000000002') = 'open', 'reports on other comments stay open');
select test.ok(test.error_of($$select public.moderation_resolve('comment_report', '5c000000-0000-0000-0000-000000000001', 'hide')$$) = 'this item is already resolved', 're-resolving raises');
select test.ok(test.state_of($$select public.moderation_resolve('comment_report', '5c000000-0000-0000-0000-000000000005', 'dismiss')$$) = '55000',
  'the sibling report that was actioned along with it cannot be resolved again');
select test.login('00000000-0000-0000-0000-0000000008a3');
select test.ok((select count(*) from public.comments where id = '5a000000-0000-0000-0000-000000000001') = 0, 'the hidden comment is gone for other readers');
select test.login('00000000-0000-0000-0000-0000000008ad');
select public.moderation_resolve('comment_report', '5c000000-0000-0000-0000-000000000002', 'dismiss');
select test.ok((select status from public.reports where id = '5c000000-0000-0000-0000-000000000002') = 'dismissed'
  and not (select is_hidden from public.comments where id = '5a000000-0000-0000-0000-000000000002'), 'dismiss closes the report and leaves the comment');
select public.moderation_resolve('review_report', '5c000000-0000-0000-0000-000000000003', 'hide');
select test.ok((select is_hidden from public.reviews where id = '5b000000-0000-0000-0000-000000000001')
  and (select status from public.reports where id = '5c000000-0000-0000-0000-000000000003') = 'actioned', 'hiding a review actions its report');
select public.moderation_resolve('user_report', '5c000000-0000-0000-0000-000000000004', 'dismiss');
select test.ok((select status from public.reports where id = '5c000000-0000-0000-0000-000000000004') = 'dismissed', 'a user report is dismissed');
select test.ok(not exists (select 1 from test.mq where kind in ('comment_report', 'review_report', 'user_report')), 'resolved reports leave the queue');

-- 6. Removal requests ----------------------------------------------------------------
select public.moderation_resolve('removal_request', '5d000000-0000-0000-0000-000000000001', 'hide');
select test.ok((select is_hidden from public.stories where id = '58000000-0000-0000-0000-000000000005')
  and (select status from public.removal_requests where id = '5d000000-0000-0000-0000-000000000001') = 'actioned', 'hide hides the fic and actions the request');
select test.ok(test.error_of($$select public.moderation_resolve('removal_request', '5d000000-0000-0000-0000-000000000002', 'hide')$$)
  = 'no fic in the app matches this link: dismiss the request', 'a request whose fic is not in the app cannot be hidden');
select test.ok((select status from public.removal_requests where id = '5d000000-0000-0000-0000-000000000002') = 'open', '... and stays open');
select public.moderation_resolve('removal_request', '5d000000-0000-0000-0000-000000000003', 'hide');
select test.ok((select is_hidden from public.stories where id = '58000000-0000-0000-0000-000000000003')
  and (select story_id from public.removal_requests where id = '5d000000-0000-0000-0000-000000000003') = '58000000-0000-0000-0000-000000000003',
  'a request filed before the fic was added is matched by its link when resolved');
select public.moderation_resolve('removal_request', '5d000000-0000-0000-0000-000000000002', 'dismiss');
select test.ok((select status from public.removal_requests where id = '5d000000-0000-0000-0000-000000000002') = 'dismissed', 'dismiss closes the request');

-- 7. Feedback ---------------------------------------------------------------------------
select public.moderation_resolve('feedback', '5e000000-0000-0000-0000-000000000001', 'done');
select public.moderation_resolve('feedback', '5e000000-0000-0000-0000-000000000002', 'dismiss');
select test.ok((select array_agg(status::text order by id) from public.feedback where id::text like '5e000000-%') = array['actioned','dismissed'], 'done actions and dismiss dismisses feedback');
select test.ok(test.error_of($$select public.moderation_resolve('feedback', '5e000000-0000-0000-0000-000000000001', 'done')$$) = 'this item is already resolved', 'feedback resolves once');

-- 8. Chapter counts ---------------------------------------------------------------------
select public.moderation_resolve('chapter_count', '5f000000-0000-0000-0000-000000000001', 'accept');
select test.ok((select total_sections from public.stories where id = '58000000-0000-0000-0000-000000000001') = 12
  and (select status from public.chapter_count_requests where id = '5f000000-0000-0000-0000-000000000001') = 'actioned', 'accept sets the count');
select test.ok((select array_agg(progress_section order by user_id) from public.library_entries where story_id = '58000000-0000-0000-0000-000000000001' and user_id <> '00000000-0000-0000-0000-0000000008a4')
  = array[1, 12, 9], 'a raised count: finished readers follow it, others keep their place');
select test.ok((select status from public.chapter_count_requests where id = '5f000000-0000-0000-0000-000000000002') = 'open', 'a different proposal for the same book stays open');
select public.moderation_resolve('chapter_count', '5f000000-0000-0000-0000-000000000002', 'dismiss');
select test.ok((select status from public.chapter_count_requests where id = '5f000000-0000-0000-0000-000000000002') = 'dismissed'
  and (select total_sections from public.stories where id = '58000000-0000-0000-0000-000000000001') = 12, 'dismiss leaves the count');

-- A lowered count: readers past it are brought back to it, nobody is left beyond the end.
select test.login('00000000-0000-0000-0000-0000000008a1');
insert into public.chapter_count_requests (id, story_id, proposed) values ('5f000000-0000-0000-0000-000000000003', '58000000-0000-0000-0000-000000000001', 5);
insert into public.chapter_count_requests (id, story_id, proposed) values ('5f000000-0000-0000-0000-000000000004', '58000000-0000-0000-0000-000000000004', 20 - 1);
select test.login('00000000-0000-0000-0000-0000000008ad');
select public.moderation_resolve('chapter_count', '5f000000-0000-0000-0000-000000000003', 'accept');
select test.ok((select total_sections from public.stories where id = '58000000-0000-0000-0000-000000000001') = 5, 'a lowered count is accepted');
select test.ok((select array_agg(progress_section order by user_id) from public.library_entries where story_id = '58000000-0000-0000-0000-000000000001' and user_id <> '00000000-0000-0000-0000-0000000008a4')
  = array[1, 5, 5], 'readers beyond the new count are moved to it; the others keep their place');
select test.ok((select status from public.library_entries where user_id = '00000000-0000-0000-0000-0000000008a2' and story_id = '58000000-0000-0000-0000-000000000001') = 'finished',
  'a finished reader stays finished');
select test.ok(not exists (select 1 from public.library_entries le join public.stories s on s.id = le.story_id where le.progress_section > s.total_sections), 'nobody is beyond the end of a book');
select test.ok(test.error_of($$select public.moderation_resolve('chapter_count', '5f000000-0000-0000-0000-000000000003', 'accept')$$) = 'this item is already resolved', 'accept once');
select test.ok((select count(*) from test.mq) = 1, 'only the untouched request is left in the queue');

select test.logout();
\o
\echo 'MODERATION PASSED'
