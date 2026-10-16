-- Push notifications (docs/DECISIONS.md, Spoiler Safe Mode 5: notifications never contain comment
-- text). The database builds each push; sending is switched on in push_settings.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

select test.logout();
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000901'), ('00000000-0000-0000-0000-000000000902');
insert into public.profiles (id, username) values ('00000000-0000-0000-0000-000000000901', 'pia'), ('00000000-0000-0000-0000-000000000902', 'pavel');
insert into public.stories (id, kind, language, title, author_name, total_sections, status) values
  ('99000000-0000-0000-0000-000000000001', 'book', 'en', 'Push Book', 'x', 3, 'completed');
insert into public.library_entries (user_id, story_id, status, progress_section) values
  ('00000000-0000-0000-0000-000000000901', '99000000-0000-0000-0000-000000000001', 'finished', 3),
  ('00000000-0000-0000-0000-000000000902', '99000000-0000-0000-0000-000000000001', 'finished', 3);

-- 1. Device tokens are yours alone, registered only through claim_push_token -------------------
select test.login('00000000-0000-0000-0000-000000000901');
select public.claim_push_token('ExponentPushToken[pia-phone]', 'bg', 'ios');
select test.ok(test.error_of($$select public.claim_push_token('not a token', 'en', 'ios')$$)
  like '%push_token_format%', 'only Expo push tokens');
select test.ok(test.error_of($$insert into public.push_tokens (token, language, platform) values ('ExponentPushToken[direct]', 'en', 'ios')$$)
  like '%permission denied%', 'no direct inserts: devices are registered through claim_push_token');
select test.login('00000000-0000-0000-0000-000000000902');
select public.claim_push_token('ExponentPushToken[pavel-phone]', 'en', 'android');
select test.ok((select count(*) from public.push_tokens) = 1, 'you only see your own devices');
select public.claim_push_token('ExponentPushToken[pavel-' || n || ']', 'en', 'android') from generate_series(1, 12) n;
select test.ok((select count(*) from public.push_tokens) = 10, 'at most 10 devices per reader (the oldest are forgotten)');
select test.logout();
select test.ok(test.error_of($$set role anon; select public.release_push_token('ExponentPushToken[pavel-12]')$$) is null,
  'a signed-out phone can still forget its own device');
reset role;
select test.ok(not exists (select 1 from public.push_tokens where token = 'ExponentPushToken[pavel-12]'), 'and it is gone');
select test.login('00000000-0000-0000-0000-000000000902');

-- A phone changes hands: the device follows whoever signs in on it now.
select test.login('00000000-0000-0000-0000-000000000901');
select public.claim_push_token('ExponentPushToken[shared-phone]', 'en', 'ios');
select test.login('00000000-0000-0000-0000-000000000902');
select public.claim_push_token('ExponentPushToken[shared-phone]', 'bg', 'ios');
select test.logout();
select test.ok((select user_id from public.push_tokens where token = 'ExponentPushToken[shared-phone]') = '00000000-0000-0000-0000-000000000902',
  'a device belongs to whoever signed in on it last');
delete from public.push_tokens where token = 'ExponentPushToken[shared-phone]';
select test.login('00000000-0000-0000-0000-000000000902');

-- 2. What a push says --------------------------------------------------------------------------
select public.open_discussion('99000000-0000-0000-0000-000000000001', 'chapter', 2);
select test.login('00000000-0000-0000-0000-000000000901');
insert into public.comments (id, discussion_id, body)
  select '99100000-0000-0000-0000-000000000001', id, 'The butler did it' from public.discussions
  where story_id = '99000000-0000-0000-0000-000000000001' and section_number = 2;
select test.login('00000000-0000-0000-0000-000000000902');
insert into public.comments (discussion_id, parent_id, body)
  select id, '99100000-0000-0000-0000-000000000001', 'No way, the butler?!' from public.discussions
  where story_id = '99000000-0000-0000-0000-000000000001' and section_number = 2;
insert into public.reactions (comment_id, emoji) values ('99100000-0000-0000-0000-000000000001', '😱');

select test.logout();
create temp table pushes as
  select n.type, public.push_messages(n.id) as messages from public.notifications n
  where n.user_id = '00000000-0000-0000-0000-000000000901';
select test.ok((select jsonb_array_length(messages) from pushes where type = 'reply') = 1, 'one message per device of the recipient');
select test.ok((select messages->0->>'to' from pushes where type = 'reply') = 'ExponentPushToken[pia-phone]', 'sent to the recipient''s device');
select test.ok((select messages->0->>'body' from pushes where type = 'reply') = 'pavel ти отговори в Push Book · Глава 2',
  'in the language of the device, with who, which story and which chapter');
select test.ok((select messages::text not like '%butler%' from pushes where type = 'reply'), 'never the comment text');
select test.ok((select messages->0->'data'->>'url' from pushes where type = 'reply') = '/room/99000000-0000-0000-0000-000000000001/2',
  'opens the room (which checks the spoiler wall again)');
select test.ok((select jsonb_array_length(messages) from pushes where type = 'reaction') = 0, 'reactions don''t buzz your phone');
update public.library_entries set status = 'currently_reading', progress_section = 1
  where user_id = '00000000-0000-0000-0000-000000000901' and story_id = '99000000-0000-0000-0000-000000000001';
select test.ok((select bool_and(jsonb_array_length(public.push_messages(n.id)) = 0) from public.notifications n
  where n.user_id = '00000000-0000-0000-0000-000000000901'), 'no push about a room the reader has closed again');
update public.library_entries set status = 'finished', progress_section = 3
  where user_id = '00000000-0000-0000-0000-000000000901' and story_id = '99000000-0000-0000-0000-000000000001';
update public.stories set is_hidden = true where id = '99000000-0000-0000-0000-000000000001';
select test.ok((select bool_and(jsonb_array_length(public.push_messages(n.id)) = 0) from public.notifications n
  where n.user_id = '00000000-0000-0000-0000-000000000901'), 'no push about a hidden story');
update public.stories set is_hidden = false where id = '99000000-0000-0000-0000-000000000001';

-- 3. Sending is off until switched on, and the settings are admin-only -----------------------------
select test.ok((select not enabled from public.push_settings), 'push sending starts switched off');
select test.login('00000000-0000-0000-0000-000000000901');
select test.ok((select count(*) from public.push_settings) = 0, 'readers cannot see push settings');
select test.logout();
update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-000000000901';
select test.login('00000000-0000-0000-0000-000000000901');
select test.ok(test.error_of($$update public.push_settings set url = 'https://attacker.example/'$$) like '%permission denied%',
  'not even app admins can change where pushes go (only migrations / the service role)');
select test.logout();
update public.profiles set is_admin = false where id = '00000000-0000-0000-0000-000000000901';
select test.ok(test.error_of($$update public.push_settings set url = 'https://'$$) like '%push_settings_url%', 'the push address must be a real https URL');

-- 4. A failing send never loses the comment ---------------------------------------------------------
create schema if not exists net;
create function net.http_post(url text, body jsonb, headers jsonb) returns bigint language plpgsql as $f$
begin raise exception 'push service unreachable'; end $f$;
update public.push_settings set enabled = true;
select test.login('00000000-0000-0000-0000-000000000902');
select test.ok(test.error_of($$insert into public.comments (discussion_id, parent_id, body)
  select id, '99100000-0000-0000-0000-000000000001', 'still posted' from public.discussions
  where story_id = '99000000-0000-0000-0000-000000000001' and section_number = 2$$) is null,
  'a reply is saved even when sending its push fails');
select test.logout();
update public.push_settings set enabled = false;
drop function net.http_post(text, jsonb, jsonb);
drop schema net;

select test.logout();
\o
\echo 'PUSH RULES PASSED'
