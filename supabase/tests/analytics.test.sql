-- First-party analytics (docs/DECISIONS.md, Dev defaults): named events from a fixed list, small
-- non-content properties, write-only for readers.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

select test.logout();
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000a01'), ('00000000-0000-0000-0000-000000000a02');
insert into public.profiles (id, username) values ('00000000-0000-0000-0000-000000000a01', 'ana'), ('00000000-0000-0000-0000-000000000a02', 'ani');

-- Before onboarding there is no profile yet, but sign_up and the first app_open still count.
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000a03');
select test.login('00000000-0000-0000-0000-000000000a03');
select test.ok(test.error_of($$insert into public.analytics_events (name) values ('sign_up')$$) is null, 'events before onboarding are kept');

select test.login('00000000-0000-0000-0000-000000000a01');
select test.ok(test.error_of($$insert into public.analytics_events (name, props, app_version, platform)
  values ('story_added', '{"kind": "fanfic"}', '0.1.0', 'ios')$$) is null, 'a known event with a small property');
select test.ok(test.error_of($$insert into public.analytics_events (name) values ('anything_goes')$$) like '%analytics_event_known%',
  'only events from the list');
select test.ok(test.error_of($$insert into public.analytics_events (name, props) values ('app_open', '["x"]')$$) like '%analytics_props_small%',
  'properties are an object');
select test.ok(test.error_of($$insert into public.analytics_events (name, props) values ('app_open', jsonb_build_object('x', repeat('a', 600)))$$)
  like '%analytics_props_small%', 'properties stay small');
select test.ok(test.error_of($$insert into public.analytics_events (user_id, name) values ('00000000-0000-0000-0000-000000000a02', 'app_open')$$)
  like '%row-level security%', 'you can only record your own events');
select test.ok((select count(*) from public.analytics_events) = 0, 'readers cannot read events back, not even their own');
-- The opt-out (PO, 18 Oct 2026): a reader who switches "Help us improve the app" off records nothing.
select test.ok(test.error_of($$insert into public.analytics_opt_outs default values$$) is null, 'a reader can opt out');
select test.ok(test.error_of($$insert into public.analytics_events (name) values ('app_open')$$) like '%row-level security%',
  'nothing is recorded while opted out');
select test.ok((select count(*) from public.analytics_opt_outs) = 1, 'you can see your own opt-out');
select test.login('00000000-0000-0000-0000-000000000a02');
select test.ok((select count(*) from public.analytics_opt_outs) = 0, 'nobody else can see that you opted out');
select test.ok(test.error_of($$insert into public.analytics_opt_outs (user_id) values ('00000000-0000-0000-0000-000000000a01')$$)
  like '%row-level security%', 'you cannot opt someone else out');
select test.ok(test.error_of($$insert into public.analytics_events (name) values ('app_open')$$) is null, 'other readers still count');
select test.login('00000000-0000-0000-0000-000000000a01');
delete from public.analytics_opt_outs;
select test.ok(test.error_of($$insert into public.analytics_events (name) values ('app_open')$$) is null, 'opting back in records again');

select test.ok(test.error_of($$insert into public.analytics_events (name) select 'app_open' from generate_series(1, 301)$$) like '%too many%',
  'at most 300 events an hour per reader');


-- Opening a discussion room is an event of its own (for "readers who reach a discussion").
select test.ok(test.error_of($$insert into public.analytics_events (name) values ('room_opened')$$) is null, 'room_opened is a known event');

-- The PO's numbers (DECISIONS.md, Analytics): admins only, weekly, from analytics_events alone. -------------
select test.logout();
delete from public.analytics_events;
update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-000000000a01';
select test.login('00000000-0000-0000-0000-000000000a02');
select test.ok(test.error_of($$select * from public.admin_numbers()$$) like '%only admins%', 'readers cannot see the numbers');
select test.logout();
select set_config('role', 'anon', false);
select test.ok(test.error_of($$select * from public.admin_numbers()$$) like '%permission denied%', 'nor can anyone signed out');
select test.logout();

-- Weeks start on Monday (UTC). wa is a Monday four weeks back, so its week-1 windows have all closed.
create function test.wa() returns timestamptz language sql stable as
$$ select (date_trunc('week', now() at time zone 'UTC') - interval '4 weeks') at time zone 'UTC' $$;
create function test.n(p_week timestamptz, p_column text) returns int language sql as
$$ select (to_jsonb(n) ->> p_column)::int from public.admin_numbers(8) n where n.week = (p_week at time zone 'UTC')::date $$;
grant execute on all functions in schema test to authenticated, anon;

insert into auth.users (id) select ('00000000-0000-0000-0000-000000000b0' || i)::uuid from generate_series(1, 7) i;
-- Four readers sign up on wa's Tuesday; each comes back once, either side of the day-7 and day-14 edges.
insert into public.analytics_events (user_id, name, created_at)
  select ('00000000-0000-0000-0000-000000000b0' || i)::uuid, 'sign_up', test.wa() + interval '1 day' from generate_series(1, 4) i;
insert into public.analytics_events (user_id, name, created_at) values
  ('00000000-0000-0000-0000-000000000b01', 'app_open', test.wa() + interval '1 day' + interval '7 days' - interval '1 second'),
  ('00000000-0000-0000-0000-000000000b02', 'app_open', test.wa() + interval '1 day' + interval '7 days'),
  ('00000000-0000-0000-0000-000000000b03', 'app_open', test.wa() + interval '1 day' + interval '14 days' - interval '1 second'),
  ('00000000-0000-0000-0000-000000000b04', 'app_open', test.wa() + interval '1 day' + interval '14 days');
-- The week after: discussions and stories added (by b02, who has already returned, and b05, who never signed up here).
insert into public.analytics_events (user_id, name, props, created_at) values
  ('00000000-0000-0000-0000-000000000b05', 'room_opened', '{}', test.wa() + interval '9 days'),
  ('00000000-0000-0000-0000-000000000b02', 'comment_posted', '{"kind": "comment"}', test.wa() + interval '9 days'),
  ('00000000-0000-0000-0000-000000000b02', 'reaction_added', '{}', test.wa() + interval '9 days'),
  ('00000000-0000-0000-0000-000000000b05', 'story_added', '{"kind": "book", "source": "open_library", "language": "bg"}', test.wa() + interval '9 days'),
  ('00000000-0000-0000-0000-000000000b05', 'story_added', '{"kind": "book", "source": "open_library", "language": "en"}', test.wa() + interval '9 days'),
  ('00000000-0000-0000-0000-000000000b05', 'story_added', '{"kind": "book", "source": "manual", "language": "bg"}', test.wa() + interval '9 days'),
  ('00000000-0000-0000-0000-000000000b05', 'story_added', '{"kind": "fanfic", "source": "ao3"}', test.wa() + interval '9 days'),
  ('00000000-0000-0000-0000-000000000b05', 'story_added', '{"kind": "book", "source": "manual", "language": "de"}', test.wa() + interval '9 days');
-- b06 opted out and so has no events at all; b07 signed up this week, so its week-1 window is still open.
insert into public.analytics_opt_outs (user_id) values ('00000000-0000-0000-0000-000000000b06');
insert into public.analytics_events (user_id, name, created_at) values ('00000000-0000-0000-0000-000000000b07', 'sign_up', now());

select test.login('00000000-0000-0000-0000-000000000a01');
select test.ok((select count(*) from public.admin_numbers(8)) = 8, 'one row per week, the current week included');
select test.ok((select count(*) from public.admin_numbers(3)) = 3, 'as many weeks as asked for');
select test.ok(test.error_of($$select * from public.admin_numbers(0)$$) is not null, 'at least one week');
select test.ok((select max(week) from public.admin_numbers(8)) = (date_trunc('week', now() at time zone 'UTC'))::date, 'the latest row is this week');
select test.ok(test.n(test.wa(), 'active') = 4, 'weekly active readers: everyone with any event that week');
select test.ok(test.n(test.wa(), 'signed_up') = 4, 'sign-ups that week');
select test.ok(test.n(test.wa(), 'returned_week1') = 2,
  'week-1 return counts an event on days 7 to 13 after signing up, not day 6 or day 14');
select test.ok(test.n(test.wa() + interval '1 week', 'active') = 3, 'the week after: b01 (day 6), b02 (day 7) and b05');
select test.ok(test.n(test.wa() + interval '1 week', 'discussion_readers') = 2,
  'readers who reach a discussion: opened a room, commented or reacted, each counted once');
select test.ok(test.n(test.wa() + interval '1 week', 'added_search') = 2 and test.n(test.wa() + interval '1 week', 'added_manual') = 2
  and test.n(test.wa() + interval '1 week', 'added_ao3') = 1, 'stories added by search, by hand and from AO3');
select test.ok(test.n(test.wa() + interval '1 week', 'added_bg') = 2 and test.n(test.wa() + interval '1 week', 'added_en') = 1
  and test.n(test.wa() + interval '1 week', 'added_unknown') = 2, 'by edition language; none or another one is unknown');
select test.ok(test.n(test.wa() + interval '1 week', 'returned_week1') = 0, 'no sign-ups: nobody returned');
select test.ok(test.n(test.wa() + interval '2 weeks', 'active') = 2, 'b03 (day 13) and b04 (day 14) were active two weeks on');
select test.ok((select sum(active) from public.admin_numbers(8)) = 10, 'an opted-out reader is never counted');
select test.ok(test.n(test.wa() + interval '4 weeks', 'signed_up') = 1, 'this week''s sign-up is counted');
select test.ok((select returned_week1 from public.admin_numbers(8) where week = (date_trunc('week', now() at time zone 'UTC'))::date) is null,
  'week-1 return is unknown while the window is still open');
select test.ok(test.n(test.wa() + interval '2 weeks', 'returned_week1') is null,
  'a week''s return stays unknown until its last sign-up has had all of days 7 to 13');
select test.ok(test.n(test.wa() + interval '1 week', 'returned_week1') is not null, 'and is known once they have');
select test.ok(test.n(test.wa() - interval '1 week', 'active') = 0, 'quiet weeks are shown as zero');
select test.logout();
update public.profiles set is_admin = false where id = '00000000-0000-0000-0000-000000000a01';

select test.logout();
\o
\echo 'ANALYTICS RULES PASSED'
