-- First-party analytics (docs/DECISIONS.md, Dev defaults): named events from a fixed list, small
-- non-content properties, write-only for readers.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

select test.logout();
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000a01'), ('00000000-0000-0000-0000-000000000a02');
insert into public.profiles (id, username) values ('00000000-0000-0000-0000-000000000a01', 'ana'), ('00000000-0000-0000-0000-000000000a02', 'ani');

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
select test.ok(test.error_of($$insert into public.analytics_events (name) select 'app_open' from generate_series(1, 301)$$) like '%too many%',
  'at most 300 events an hour per reader');

select test.logout();
\o
\echo 'ANALYTICS RULES PASSED'
