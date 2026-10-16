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

-- 1. Device tokens are yours alone -----------------------------------------------------------
select test.login('00000000-0000-0000-0000-000000000901');
insert into public.push_tokens (token, language, platform) values ('ExponentPushToken[pia-phone]', 'bg', 'ios');
select test.ok(test.error_of($$insert into public.push_tokens (token, language, platform) values ('not a token', 'en', 'ios')$$)
  like '%push_token_format%', 'only Expo push tokens');
select test.login('00000000-0000-0000-0000-000000000902');
insert into public.push_tokens (token, language, platform) values ('ExponentPushToken[pavel-phone]', 'en', 'android');
select test.ok((select count(*) from public.push_tokens) = 1, 'you only see your own devices');
select test.ok(test.error_of($$insert into public.push_tokens (user_id, token, language, platform)
  values ('00000000-0000-0000-0000-000000000901', 'ExponentPushToken[sneaky]', 'en', 'ios')$$) like '%row-level security%',
  'you cannot register a device for someone else');

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

-- 3. Sending is off until switched on, and the settings are admin-only -----------------------------
select test.ok((select not enabled from public.push_settings), 'push sending starts switched off');
select test.login('00000000-0000-0000-0000-000000000901');
select test.ok((select count(*) from public.push_settings) = 0, 'readers cannot see push settings');
select test.error_of($$update public.push_settings set enabled = true$$);
select test.logout();
select test.ok((select not enabled from public.push_settings), 'readers cannot switch push on');

select test.logout();
\o
\echo 'PUSH RULES PASSED'
