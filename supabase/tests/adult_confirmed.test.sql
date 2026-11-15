-- The 18+ confirmation (docs/DECISIONS.md, "Explicit works: an 18+ confirmation"): a yes/no on the
-- profile, no by default, private to the reader (read through my_profile()). The reader sets it once,
-- with confirm_adult(), from the dialog before an Explicit work's AO3 link or discussion; it only ever
-- goes from no to yes, and nobody can set it for someone else. Runs after terms_acceptance.test.sql
-- (needs test.failure_of) and spoiler_rules.test.sql (test.error_of).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

select test.logout();
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000a1801'), ('00000000-0000-0000-0000-0000000a1802');

select test.login('00000000-0000-0000-0000-0000000a1801');
insert into public.profiles (id, username) values ('00000000-0000-0000-0000-0000000a1801', 'adult_mira');
select test.login('00000000-0000-0000-0000-0000000a1802');
insert into public.profiles (id, username) values ('00000000-0000-0000-0000-0000000a1802', 'adult_niko');
select test.logout();

select test.ok((select not adult_confirmed from public.profiles where username = 'adult_mira'),
  'a new profile is not confirmed as 18 or over');
select test.ok((select is_nullable = 'NO' and column_default = 'false' and data_type = 'boolean'
  from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'adult_confirmed'),
  'the flag is a yes/no that is never null and defaults to no');
select test.ok(not exists (select from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'adult_confirmed'
      and grantee in ('authenticated', 'anon') and privilege_type in ('SELECT', 'UPDATE', 'INSERT')),
  'the flag is private: no reader can select, update or insert the column directly');

-- Mira reads her own answer through my_profile(); Niko cannot read hers at all.
select test.login('00000000-0000-0000-0000-0000000a1801');
select test.ok((select not adult_confirmed from public.my_profile()), 'the reader reads her own answer through my_profile()');
select test.login('00000000-0000-0000-0000-0000000a1802');
select test.ok(test.error_of($q$select adult_confirmed from public.profiles where username = 'adult_mira'$q$)
  like 'permission denied%', 'another reader cannot read the answer');

-- Mira confirms from the dialog.
select test.login('00000000-0000-0000-0000-0000000a1801');
select test.ok(test.failure_of($q$update public.profiles set adult_confirmed = true where id = auth.uid()$q$)
  like '42501: permission denied%', 'the reader cannot write the column directly, only through confirm_adult()');
select public.confirm_adult();
select test.ok((select adult_confirmed from public.my_profile()), 'confirm_adult() records the reader''s yes');
select public.confirm_adult();
select test.ok((select adult_confirmed from public.my_profile()), 'confirming again is harmless');
select test.ok(test.failure_of($q$update public.profiles set adult_confirmed = false where id = auth.uid()$q$)
  like '42501: permission denied%', 'the reader cannot write a no over it');

-- Confirming only ever touches the caller's own row: Mira's yes left Niko's answer alone.
select test.logout();
select test.ok((select not adult_confirmed from public.profiles where username = 'adult_niko'),
  'one reader confirming does not confirm another');

-- Without a reader's session, nobody sets it, and nobody turns a yes back into a no: not the database
-- owner, not a server key.
select test.ok(test.failure_of($$update public.profiles set adult_confirmed = false where id = '00000000-0000-0000-0000-0000000a1801'$$)
  = 'LV001: the 18+ confirmation cannot be taken back', 'the database owner cannot take it back');
select test.ok(test.failure_of($$update public.profiles set adult_confirmed = true where id = '00000000-0000-0000-0000-0000000a1802'$$)
  = 'LV001: only the reader can say they are 18 or over', 'the database owner cannot confirm for a reader');
select test.ok(test.failure_of($$insert into public.profiles (id, username, adult_confirmed)
  values ('00000000-0000-0000-0000-0000000a1803', 'adult_ghost', true)$$)
  = 'LV001: only the reader can say they are 18 or over', 'nobody can create a profile that is already confirmed');
select test.ok((select adult_confirmed from public.profiles where username = 'adult_mira')
  and (select not adult_confirmed from public.profiles where username = 'adult_niko'), 'both answers are unchanged');

-- Signed out, confirm_adult() is not callable.
select test.ok(test.failure_of($q$select public.confirm_adult()$q$) like '42501: permission denied for function confirm_adult',
  'anon cannot call confirm_adult()');

-- Other edits by the database owner (e.g. moderation) still work.
update public.profiles set display_name = 'Mira' where id = '00000000-0000-0000-0000-0000000a1801';
select test.ok((select display_name = 'Mira' and adult_confirmed from public.profiles where username = 'adult_mira'),
  'an unrelated edit by the database owner leaves the answer alone');


-- Discussion rooms (legal review, 14 Nov 2026): an Explicit fic's rooms are only for readers who said
-- they are 18 or over; Mature and the other ratings are unaffected. Mira is confirmed, Niko is not.
insert into public.stories (id, kind, title, author_name, published_sections, status, source, source_url, content_rating, created_by) values
  ('18000000-0000-0000-0000-000000000001', 'fanfic', 'An Explicit Fic', 'w', 3, 'completed', 'ao3',
   'https://archiveofourown.org/works/1800001', 'Explicit', '00000000-0000-0000-0000-0000000a1801'),
  ('18000000-0000-0000-0000-000000000002', 'fanfic', 'A Mature Fic', 'w', 3, 'completed', 'ao3',
   'https://archiveofourown.org/works/1800002', 'Mature', '00000000-0000-0000-0000-0000000a1801');
insert into public.library_entries (user_id, story_id, status) values
  ('00000000-0000-0000-0000-0000000a1801', '18000000-0000-0000-0000-000000000001', 'finished'),
  ('00000000-0000-0000-0000-0000000a1801', '18000000-0000-0000-0000-000000000002', 'finished'),
  ('00000000-0000-0000-0000-0000000a1802', '18000000-0000-0000-0000-000000000001', 'finished'),
  ('00000000-0000-0000-0000-0000000a1802', '18000000-0000-0000-0000-000000000002', 'finished');

-- Mira opens and posts in both.
select test.login('00000000-0000-0000-0000-0000000a1801');
select public.open_discussion('18000000-0000-0000-0000-000000000001', 'chapter', 1);
select public.open_discussion('18000000-0000-0000-0000-000000000001', 'epilogue');
select public.open_discussion('18000000-0000-0000-0000-000000000002', 'chapter', 1);
insert into public.comments (discussion_id, body)
  select id, 'mira on the explicit fic' from public.discussions where story_id = '18000000-0000-0000-0000-000000000001' and kind = 'chapter';
insert into public.comments (discussion_id, body)
  select id, 'mira on the mature fic' from public.discussions where story_id = '18000000-0000-0000-0000-000000000002' and kind = 'chapter';
select test.ok((select count(*) = 2 from public.comments where body like 'mira on the %'), 'a confirmed reader reads and posts in an Explicit fic''s room');

-- Niko, unconfirmed, can neither open, read nor post in the Explicit fic's rooms.
select test.login('00000000-0000-0000-0000-0000000a1802');
select test.ok(test.failure_of($$select public.open_discussion('18000000-0000-0000-0000-000000000001', 'chapter', 1)$$) like '42501: locked%',
  'an unconfirmed reader cannot open an Explicit fic''s chapter room');
select test.ok(test.failure_of($$select public.open_discussion('18000000-0000-0000-0000-000000000001', 'epilogue')$$) like '42501: locked%',
  'an unconfirmed reader cannot open an Explicit fic''s epilogue');
select test.ok((select count(*) = 0 from public.comments where body = 'mira on the explicit fic'),
  'an unconfirmed reader cannot read an Explicit fic''s comments');
select test.ok(test.failure_of($$insert into public.comments (discussion_id, body)
  select id, 'niko sneaks in' from public.discussions where story_id = '18000000-0000-0000-0000-000000000001' and kind = 'chapter'$$)
  like '42501: new row violates row-level security policy%', 'an unconfirmed reader cannot post in an Explicit fic''s room');
-- The Mature fic is unaffected.
select public.open_discussion('18000000-0000-0000-0000-000000000002', 'chapter', 1);
insert into public.comments (discussion_id, body)
  select id, 'niko on the mature fic' from public.discussions where story_id = '18000000-0000-0000-0000-000000000002' and kind = 'chapter';
select test.ok((select count(*) = 2 from public.comments where body in ('mira on the mature fic', 'niko on the mature fic')),
  'an unconfirmed reader reads and posts in a Mature fic''s room');

-- No @mention and no push from an Explicit room for Niko; the Mature room still notifies him.
select test.logout();
insert into public.push_tokens (token, user_id, language, platform)
  values ('ExponentPushToken[adult-niko]', '00000000-0000-0000-0000-0000000a1802', 'en', 'ios');
select test.login('00000000-0000-0000-0000-0000000a1801');
insert into public.comments (discussion_id, body)
  select id, '@adult_niko read this one' from public.discussions where story_id in
    ('18000000-0000-0000-0000-000000000001', '18000000-0000-0000-0000-000000000002') and kind = 'chapter';
select test.logout();
select test.ok((select count(*) = 0 from public.notifications n join public.discussions d on d.id = n.discussion_id
  where n.user_id = '00000000-0000-0000-0000-0000000a1802' and n.type = 'mention' and d.story_id = '18000000-0000-0000-0000-000000000001'),
  'an unconfirmed reader gets no @mention from an Explicit fic''s room');
select test.ok((select count(*) = 1 from public.notifications n join public.discussions d on d.id = n.discussion_id
  where n.user_id = '00000000-0000-0000-0000-0000000a1802' and n.type = 'mention' and d.story_id = '18000000-0000-0000-0000-000000000002'),
  'the same mention in a Mature fic''s room notifies them');
-- A notification from before (or written by hand) is never pushed while they are unconfirmed.
insert into public.notifications (user_id, type, actor_id, discussion_id)
  select '00000000-0000-0000-0000-0000000a1802', 'mention', '00000000-0000-0000-0000-0000000a1801', id
  from public.discussions where story_id = '18000000-0000-0000-0000-000000000001' and kind = 'chapter';
select test.ok((select bool_and(jsonb_array_length(public.push_messages(n.id)) = 0) from public.notifications n
  join public.discussions d on d.id = n.discussion_id
  where n.user_id = '00000000-0000-0000-0000-0000000a1802' and d.story_id = '18000000-0000-0000-0000-000000000001'),
  'an unconfirmed reader gets no push from an Explicit fic''s room');
select test.ok((select bool_and(jsonb_array_length(public.push_messages(n.id)) = 1) from public.notifications n
  join public.discussions d on d.id = n.discussion_id
  where n.user_id = '00000000-0000-0000-0000-0000000a1802' and d.story_id = '18000000-0000-0000-0000-000000000002'),
  'the Mature room''s mention is pushed');

-- An admin who never confirmed still reads an Explicit fic's room, to moderate it.
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000a18ad');
insert into public.profiles (id, username, is_admin) values ('00000000-0000-0000-0000-0000000a18ad', 'adult_admin', true);
select test.login('00000000-0000-0000-0000-0000000a18ad');
select test.ok((select count(*) > 0 from public.comments where body = 'mira on the explicit fic'),
  'an admin reads an Explicit fic''s room without the confirmation');
select test.login('00000000-0000-0000-0000-0000000a1802');

-- The story page still lists the Explicit fic's rooms as reached, so the reader can tap one and get the
-- dialog; story_rooms says the room asks for the 18+ confirmation and shows no comment count until then.
select test.ok((select bool_and(unlocked and adult_only and comments is null)
    from public.story_rooms('18000000-0000-0000-0000-000000000001')),
  'an unconfirmed reader sees the Explicit fic''s reached rooms, marked as asking for the confirmation');
select test.ok((select bool_and(unlocked and not adult_only and comments is not null)
    from public.story_rooms('18000000-0000-0000-0000-000000000002')),
  'a Mature fic''s rooms never ask');

-- Niko confirms: the Explicit room opens.
select public.confirm_adult();
select test.ok((select count(*) = 1 from public.comments where body = 'mira on the explicit fic'), 'once confirmed, the comments are readable');
insert into public.comments (discussion_id, body)
  select id, 'niko on the explicit fic' from public.discussions where story_id = '18000000-0000-0000-0000-000000000001' and kind = 'chapter';
select test.ok((select count(*) = 1 from public.comments where body = 'niko on the explicit fic'), 'once confirmed, the reader can post');
select test.ok((select bool_and(unlocked and not adult_only and comments is not null)
    from public.story_rooms('18000000-0000-0000-0000-000000000001')),
  'once confirmed, the rooms no longer ask');

select test.logout();

\o
\echo 'ADULT CONFIRMATION RULES PASSED'
