-- The moderation e-mail (docs/DECISIONS.md: Moderation in v1): reports and author removal requests go
-- out at once, feedback and chapter-count requests as a daily digest, through Resend with the key from
-- Vault. Plain Postgres has neither pg_net nor Vault, so both are stood in for here.
-- Runs after moderation.test.sql (needs its test schema).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

select test.logout();
-- other test files left open feedback and requests behind; the digest would count them
delete from public.feedback;
delete from public.chapter_count_requests;
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000009a1'), ('00000000-0000-0000-0000-0000000009a2'), ('00000000-0000-0000-0000-0000000009a3');
insert into public.profiles (id, username, is_admin) values
  ('00000000-0000-0000-0000-0000000009a1', 'mailer', false),  -- reports, files requests
  ('00000000-0000-0000-0000-0000000009a2', 'mailed', false),  -- writes the reported comment
  ('00000000-0000-0000-0000-0000000009a3', 'mailadmin', true);
insert into public.stories (id, kind, language, title, author_name, has_chapters, total_sections, status, source_url) values
  ('98000000-0000-0000-0000-000000000001', 'fanfic', 'en', 'Mailed Fic', 'x', true, null, 'ongoing', 'https://archiveofourown.org/works/9301'),
  ('98000000-0000-0000-0000-000000000002', 'book', 'en', 'Counted Mail Book', 'x', true, 10, 'completed', null),
  ('98000000-0000-0000-0000-000000000003', 'book', 'en', 'Second Mail Book', 'x', true, 20, 'completed', null);
insert into public.discussions (id, story_id, kind, section_number) values
  ('99000000-0000-0000-0000-000000000001', '98000000-0000-0000-0000-000000000001', 'chapter', 1);
insert into public.comments (id, discussion_id, author_id, body) values
  ('9a000000-0000-0000-0000-000000000001', '99000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000009a2', 'rude words');
create table test.mail_calls (url text, body jsonb, headers jsonb, timeout_milliseconds int);

-- 1. The settings: off until set up, admin-readable, changed only by migrations / the service role
select test.ok((select not enabled and to_address = 'support@livami.app' and from_address = 'Livami <moderation@livami.app>'
                from public.moderation_email_settings), 'e-mail starts switched off, to support@livami.app');
select test.ok(test.error_of($$insert into public.moderation_email_settings (id) values (true)$$) is not null, 'there is only ever one settings row');
select test.ok(test.error_of($$update public.moderation_email_settings set to_address = 'not an address'$$) like '%moderation_email_settings_to%',
  'the recipient must look like an address');
select test.ok(test.error_of($$update public.moderation_email_settings set to_address = 'a@b.co, c@d.co'$$) like '%moderation_email_settings_to%',
  'and only one');
select test.ok(test.error_of($$update public.moderation_email_settings set from_address = E'x <a@b.co>\nBcc: c@d.co'$$) like '%moderation_email_settings_from%',
  'the sender cannot carry a line break');
select test.ok(test.error_of($$update public.moderation_email_settings set from_address = 'Livami'$$) like '%moderation_email_settings_from%',
  'the sender must look like an address');
select test.ok(test.error_of($$update public.moderation_email_settings set from_address = 'moderation@livami.app'$$) is null,
  'a bare sender address is fine');
update public.moderation_email_settings set from_address = 'Livami <moderation@livami.app>';
select test.login('00000000-0000-0000-0000-0000000009a1');
select test.ok((select count(*) from public.moderation_email_settings) = 0, 'readers cannot see the e-mail settings');
select test.ok(test.error_of($$select public.send_moderation_email('s', 't')$$) like '%permission denied%', 'readers cannot send moderation e-mail');
select test.ok(test.error_of($$select public.moderation_digest()$$) like '%permission denied%', 'nor start a digest');
select test.logout();
select test.login('00000000-0000-0000-0000-0000000009a3');
select test.ok((select count(*) from public.moderation_email_settings) = 1, 'admins can see them');
select test.ok(test.error_of($$update public.moderation_email_settings set to_address = 'attacker@example.test'$$) like '%permission denied%',
  'not even app admins can change where the mail goes');
select test.ok(test.error_of($$select public.send_moderation_email('s', 't')$$) like '%permission denied%', 'admins cannot call the sender either');
select test.logout();
set role anon;
select test.ok(test.error_of($$select public.send_moderation_email('s', 't')$$) like '%permission denied%'
  and test.error_of($$select public.moderation_digest()$$) like '%permission denied%', 'nor can signed-out visitors');
reset role;

-- 2. Without pg_net or Vault the triggers do nothing, and the insert still succeeds ---------------
update public.moderation_email_settings set enabled = true;
delete from public.reports where reporter_id = '00000000-0000-0000-0000-0000000009a1';
select test.ok(test.error_of($$insert into public.reports (reporter_id, comment_id, reason)
  values ('00000000-0000-0000-0000-0000000009a1', '9a000000-0000-0000-0000-000000000001', 'spam')$$) is null,
  'without pg_net or Vault a report is filed, quietly');

create schema net;
create function net.http_post(url text, body jsonb, headers jsonb, timeout_milliseconds int) returns bigint language plpgsql as $f$
begin insert into test.mail_calls values (url, body, headers, timeout_milliseconds); return 1; end $f$;
delete from public.reports where reporter_id = '00000000-0000-0000-0000-0000000009a1';
insert into public.reports (reporter_id, comment_id, reason) values ('00000000-0000-0000-0000-0000000009a1', '9a000000-0000-0000-0000-000000000001', 'spam');
select test.ok((select count(*) from test.mail_calls) = 0, 'pg_net but no Vault: nothing is sent');

create schema vault;
create table vault.decrypted_secrets (name text, decrypted_secret text);
update public.moderation_email_settings set enabled = false;
insert into vault.decrypted_secrets values ('resend_api_key', 're_test_key');
delete from public.reports where reporter_id = '00000000-0000-0000-0000-0000000009a1';
insert into public.reports (reporter_id, comment_id, reason) values ('00000000-0000-0000-0000-0000000009a1', '9a000000-0000-0000-0000-000000000001', 'spam');
select test.ok((select count(*) from test.mail_calls) = 0, 'switched off, even with a key: nothing is sent');

update public.moderation_email_settings set enabled = true;
delete from vault.decrypted_secrets;
delete from public.reports where reporter_id = '00000000-0000-0000-0000-0000000009a1';
select test.ok(test.error_of($$insert into public.reports (reporter_id, comment_id, reason)
  values ('00000000-0000-0000-0000-0000000009a1', '9a000000-0000-0000-0000-000000000001', 'spam')$$) is null
  and (select count(*) from test.mail_calls) = 0, 'on, but no resend_api_key in Vault: nothing is sent and the report is still filed');

-- 3. The e-mails themselves -----------------------------------------------------------------------
insert into vault.decrypted_secrets values ('resend_api_key', 're_test_key');
delete from public.reports where reporter_id = '00000000-0000-0000-0000-0000000009a1';
insert into public.reports (reporter_id, comment_id, reason, details)
  values ('00000000-0000-0000-0000-0000000009a1', '9a000000-0000-0000-0000-000000000001', 'harassment', 'he was mean to me');
select test.ok((select count(*) from test.mail_calls) = 1, 'on, with a key: a report sends one e-mail');
select test.ok((select url from test.mail_calls) = 'https://api.resend.com/emails', 'to Resend');
select test.ok((select headers from test.mail_calls) = '{"Authorization": "Bearer re_test_key", "Content-Type": "application/json"}'::jsonb,
  'with the bearer key from Vault');
select test.ok((select timeout_milliseconds from test.mail_calls) = 10000, 'with a 10 s timeout');
select test.ok((select body ->> 'from' = 'Livami <moderation@livami.app>' and body -> 'to' = '["support@livami.app"]'::jsonb
                  and body ->> 'subject' = '[Livami] New report: harassment' from test.mail_calls), 'from, to and subject');
select test.ok((select body ->> 'text' = E'Report on a comment. Reason: harassment.\nStory: Mailed Fic\nReporter says: he was mean to me\n\nOpen Moderation in the app to hide it or dismiss the report.'
                from test.mail_calls), 'the text names the kind, reason, story and what the reporter wrote');
select test.ok((select body::text not like '%mailer%' and body::text not like '%00000000-0000-0000-0000-0000000009a1%' from test.mail_calls),
  'it does not say who reported');
select test.ok((select count(*) from jsonb_object_keys((select body from test.mail_calls))) = 4, 'only from, to, subject and text are sent');

delete from test.mail_calls;
insert into public.reports (reporter_id, reported_user_id, reason, details)
  values ('00000000-0000-0000-0000-0000000009a1', '00000000-0000-0000-0000-0000000009a2', 'other', repeat('x', 900));
select test.ok((select body ->> 'text' = 'Report on a reader. Reason: other.' || E'\nReporter says: ' || repeat('x', 500) || E'\n\nOpen Moderation in the app to hide it or dismiss the report.'
                from test.mail_calls), 'a report on a reader has no story, and long details are cut at 500 characters');

delete from test.mail_calls;
insert into public.removal_requests (requester_id, story_id, story_url, contact, message)
  values ('00000000-0000-0000-0000-0000000009a1', '98000000-0000-0000-0000-000000000001', 'https://archiveofourown.org/works/9301', 'author@example.test', 'please hide');
select test.ok((select count(*) from test.mail_calls) = 1 and (select body ->> 'subject' from test.mail_calls) = '[Livami] Author removal request',
  'a removal request sends one e-mail');
select test.ok((select body ->> 'text' = E'An author asks for their fic to be removed.\nStory: Mailed Fic\nLink: https://archiveofourown.org/works/9301\nContact: author@example.test\nMessage: please hide\n\nReply to the contact above. Open Moderation in the app to hide the fic or dismiss the request.'
                from test.mail_calls), 'with the AO3 link and the contact to reply to');
select test.ok((select body::text not like '%mailer%' from test.mail_calls), 'and no word of who filed it');

delete from test.mail_calls;
insert into public.removal_requests (requester_id, story_url, contact) values ('00000000-0000-0000-0000-0000000009a1', 'https://archiveofourown.org/works/9999', 'someone@example.test');
select test.ok((select body ->> 'text' = E'An author asks for their fic to be removed.\nLink: https://archiveofourown.org/works/9999\nContact: someone@example.test\n\nReply to the contact above. Open Moderation in the app to hide the fic or dismiss the request.'
                from test.mail_calls), 'a request for a fic we do not have still goes out');

-- A mail that cannot be handed over must never lose the report
create or replace function net.http_post(url text, body jsonb, headers jsonb, timeout_milliseconds int) returns bigint language plpgsql as $f$
begin raise exception 'pg_net is down'; end $f$;
delete from public.reports where reporter_id = '00000000-0000-0000-0000-0000000009a1';
select test.ok(test.error_of($$insert into public.reports (id, reporter_id, comment_id, reason)
  values ('9c000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000009a1', '9a000000-0000-0000-0000-000000000001', 'spam')$$) is null, 'a failing pg_net does not fail the report insert');
select test.ok(exists (select 1 from public.reports where id = '9c000000-0000-0000-0000-000000000001'), 'and the report is kept');
select test.ok(test.error_of($$insert into public.removal_requests (id, requester_id, story_url, contact)
  values ('9d000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000009a1', 'https://archiveofourown.org/works/9998', 'a@b.co')$$) is null, 'nor the removal request insert');
select test.ok(exists (select 1 from public.removal_requests where id = '9d000000-0000-0000-0000-000000000001'), 'which is kept too');
create or replace function net.http_post(url text, body jsonb, headers jsonb, timeout_milliseconds int) returns bigint language plpgsql as $f$
begin insert into test.mail_calls values (url, body, headers, timeout_milliseconds); return 1; end $f$;
delete from test.mail_calls;

-- 4. The daily digest -----------------------------------------------------------------------------
select public.moderation_digest();
select test.ok((select count(*) from test.mail_calls) = 0, 'a quiet day sends no digest');

insert into public.feedback (user_id, kind, body, created_at, status) values
  ('00000000-0000-0000-0000-0000000009a1', 'idea', 'dark mode please', now() - interval '2 hours', 'open'),
  ('00000000-0000-0000-0000-0000000009a1', 'problem', E'it crashes\non launch', now() - interval '1 hour', 'open'),
  ('00000000-0000-0000-0000-0000000009a1', 'other', 'old news', now() - interval '25 hours', 'open'),
  ('00000000-0000-0000-0000-0000000009a1', 'other', 'already handled', now() - interval '1 hour', 'actioned');
insert into public.chapter_count_requests (requester_id, story_id, proposed, created_at, status) values
  ('00000000-0000-0000-0000-0000000009a1', '98000000-0000-0000-0000-000000000002', 12, now() - interval '3 hours', 'open'),
  ('00000000-0000-0000-0000-0000000009a2', '98000000-0000-0000-0000-000000000002', 14, now() - interval '26 hours', 'open'),
  ('00000000-0000-0000-0000-0000000009a2', '98000000-0000-0000-0000-000000000003', 22, now() - interval '1 hour', 'dismissed');
select public.moderation_digest();
select test.ok((select count(*) from test.mail_calls) = 1, 'a busy day sends one digest');
select test.ok((select body ->> 'subject' = '[Livami] Moderation digest: 2 feedback, 1 chapter-count requests' from test.mail_calls),
  'counting only the open items from the last 24 hours');
select test.ok((select body ->> 'text' = E'Open in the last 24 hours.\n\nFeedback (2):\n- idea: dark mode please\n- problem: it crashes on launch\n\nChapter-count requests (1):\n- Counted Mail Book: 12 chapters (now 10)\n\nOpen Moderation in the app.'
                from test.mail_calls), 'grouped, with short lines and no reader names');
select test.ok((select url = 'https://api.resend.com/emails' and headers ->> 'Authorization' = 'Bearer re_test_key' from test.mail_calls), 'sent the same way');

delete from test.mail_calls;
delete from public.chapter_count_requests;
select public.moderation_digest();
select test.ok((select count(*) from test.mail_calls) = 1 and (select body ->> 'subject' from test.mail_calls) = '[Livami] Moderation digest: 2 feedback, 0 chapter-count requests'
  and (select body ->> 'text' not like '%Chapter-count%' from test.mail_calls), 'feedback alone gets a digest without the empty section');

update public.moderation_email_settings set enabled = false;
delete from test.mail_calls;
select public.moderation_digest();
select test.ok((select count(*) from test.mail_calls) = 0, 'switched off: no digest');

drop function net.http_post(text, jsonb, jsonb, int);
drop schema net;
drop table vault.decrypted_secrets;
drop schema vault;
drop table test.mail_calls;
delete from public.feedback;

\o
\echo 'MODERATION E-MAIL RULES PASSED'
