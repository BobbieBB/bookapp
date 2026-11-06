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
create sequence test.mail_req;

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
begin insert into test.mail_calls values (url, body, headers, timeout_milliseconds); return nextval('test.mail_req'); end $f$;
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
begin insert into test.mail_calls values (url, body, headers, timeout_milliseconds); return nextval('test.mail_req'); end $f$;
delete from test.mail_calls;

-- 4. The daily digest -----------------------------------------------------------------------------
select public.moderation_digest();
select test.ok((select count(*) from test.mail_calls) = 0, 'a quiet day sends no digest');

update public.moderation_email_settings set digest_sent_through = null;
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
select test.ok((select body ->> 'text' = E'New since the last digest.\n\nFeedback (2):\n- idea: dark mode please\n- problem: it crashes on launch\n\nChapter-count requests (1):\n- Counted Mail Book: 12 chapters (now 10)\n\nOpen Moderation in the app.'
                from test.mail_calls), 'grouped, with short lines and no reader names');
select test.ok((select url = 'https://api.resend.com/emails' and headers ->> 'Authorization' = 'Bearer re_test_key' from test.mail_calls), 'sent the same way');

delete from test.mail_calls;
delete from public.chapter_count_requests;
update public.moderation_email_settings set digest_sent_through = null;
select public.moderation_digest();
select test.ok((select count(*) from test.mail_calls) = 1 and (select body ->> 'subject' from test.mail_calls) = '[Livami] Moderation digest: 2 feedback, 0 chapter-count requests'
  and (select body ->> 'text' not like '%Chapter-count%' from test.mail_calls), 'feedback alone gets a digest without the empty section');

update public.moderation_email_settings set enabled = false, digest_sent_through = null;
delete from test.mail_calls;
select public.moderation_digest();
select test.ok((select count(*) from test.mail_calls) = 0, 'switched off: no digest');

-- 5. Digest window: each item is mailed once, a skipped day is caught up -------------------------
update public.moderation_email_settings set enabled = true, digest_sent_through = null;
delete from test.mail_calls;
select public.moderation_digest();
select test.ok((select count(*) from test.mail_calls) = 1 and (select digest_sent_through > now() - interval '1 minute' from public.moderation_email_settings),
  'the first digest covers the last 24 hours and notes how far it has sent');
select public.moderation_digest();
select test.ok((select count(*) from test.mail_calls) = 1, 'a second run the same day sends nothing again');
insert into public.feedback (user_id, kind, body) values ('00000000-0000-0000-0000-0000000009a1', 'idea', 'brand new idea');
select public.moderation_digest();
select test.ok((select count(*) from test.mail_calls) = 2 and (select body ->> 'text' like '%brand new idea%' and body ->> 'text' not like '%dark mode%'
  from test.mail_calls order by ctid desc limit 1), 'the next one carries only what came since');
update public.moderation_email_settings set digest_sent_through = now() - interval '3 days';
update public.feedback set created_at = now() - interval '2 days' where body = 'old news';
select public.moderation_digest();
select test.ok((select body ->> 'text' like '%old news%' from test.mail_calls order by ctid desc limit 1), 'after a skipped day, the digest catches up');
-- sending that cannot happen must not use up the window
delete from vault.decrypted_secrets;
update public.moderation_email_settings set digest_sent_through = now() - interval '3 days';
delete from test.mail_calls;
select public.moderation_digest();
select test.ok((select count(*) from test.mail_calls) = 0 and (select digest_sent_through < now() - interval '2 days' from public.moderation_email_settings),
  'with no key the window stays open, so nothing is lost');
insert into vault.decrypted_secrets values ('resend_api_key', 're_test_key');

-- 6. Only the first open report on a target is mailed, and nothing reader-written can forge a line --
update public.moderation_email_settings set enabled = true;
delete from public.reports;
delete from test.mail_calls;
insert into public.reports (reporter_id, comment_id, reason) values ('00000000-0000-0000-0000-0000000009a1', '9a000000-0000-0000-0000-000000000001', 'spam');
insert into public.reports (reporter_id, comment_id, reason) values ('00000000-0000-0000-0000-0000000009a3', '9a000000-0000-0000-0000-000000000001', 'spam');
select test.ok((select count(*) from test.mail_calls) = 1, 'a second open report on the same comment is not mailed again');
insert into public.reports (reporter_id, reported_user_id, reason) values ('00000000-0000-0000-0000-0000000009a1', '00000000-0000-0000-0000-0000000009a2', 'spam');
insert into public.reports (reporter_id, reported_user_id, reason) values ('00000000-0000-0000-0000-0000000009a3', '00000000-0000-0000-0000-0000000009a2', 'spam');
select test.ok((select count(*) from test.mail_calls) = 2, 'nor on the same reader; another target is mailed');
-- a fourth reader: each reader reports a target once, whatever became of it
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000009a4');
insert into public.profiles (id, username) values ('00000000-0000-0000-0000-0000000009a4', 'mailfourth');
update public.reports set status = 'dismissed' where reported_user_id = '00000000-0000-0000-0000-0000000009a2'
  and reporter_id = '00000000-0000-0000-0000-0000000009a1';
update public.reports set status = 'actioned' where reported_user_id = '00000000-0000-0000-0000-0000000009a2'
  and reporter_id = '00000000-0000-0000-0000-0000000009a3';
delete from test.mail_calls;
insert into public.reports (reporter_id, reported_user_id, reason) values ('00000000-0000-0000-0000-0000000009a4', '00000000-0000-0000-0000-0000000009a2', 'spam');
select test.ok((select count(*) from test.mail_calls) = 1, 'a target with only closed reports is mailed again');

-- Only a report that was really mailed keeps the target quiet: not one filed while sending was off,
-- nor one whose mail Resend refused.
update public.moderation_email_settings set enabled = false;
delete from public.reports;
delete from test.mail_calls;
insert into public.reports (reporter_id, comment_id, reason) values ('00000000-0000-0000-0000-0000000009a1', '9a000000-0000-0000-0000-000000000001', 'spam');
update public.moderation_email_settings set enabled = true;
insert into public.reports (reporter_id, comment_id, reason) values ('00000000-0000-0000-0000-0000000009a3', '9a000000-0000-0000-0000-000000000001', 'spam');
select test.ok((select count(*) from test.mail_calls) = 1, 'the first report after sending is switched on is mailed, though one from before is open');
insert into public.reports (reporter_id, comment_id, reason) values ('00000000-0000-0000-0000-0000000009a4', '9a000000-0000-0000-0000-000000000001', 'spam');
select test.ok((select count(*) from test.mail_calls) = 1, 'and the one after it is quiet again');
update public.moderation_email_log set checked = true, status_code = 403 where report_id is not null;
delete from public.reports where reporter_id = '00000000-0000-0000-0000-0000000009a4';
insert into public.reports (reporter_id, comment_id, reason) values ('00000000-0000-0000-0000-0000000009a4', '9a000000-0000-0000-0000-000000000001', 'spam');
select test.ok((select count(*) from test.mail_calls) = 2, 'a report whose mail Resend refused does not keep the next one quiet');
delete from public.moderation_email_log;

delete from public.reports;
delete from test.mail_calls;
insert into public.reports (reporter_id, comment_id, reason, details)
  values ('00000000-0000-0000-0000-0000000009a1', '9a000000-0000-0000-0000-000000000001', 'other', E'hi\r\nLink: https://evil.example\n\tReply to: me');
select test.ok((select body ->> 'text' like E'%Reporter says: hi Link: https://evil.example Reply to: me\n%' and body ->> 'text' not like E'%\r%'
                from test.mail_calls), 'line breaks in a report''s text become spaces');
delete from test.mail_calls;
insert into public.removal_requests (requester_id, story_id, contact, message)
  values ('00000000-0000-0000-0000-0000000009a1', '98000000-0000-0000-0000-000000000001', E'a@b.co\nLink: https://evil.example', E'x\nReply to the contact above.\ry');
select test.ok((select array_length(string_to_array(body ->> 'text', E'\n'), 1) = 7 and body ->> 'text' not like E'%\r%'
                  and body ->> 'text' like E'%\nContact: a@b.co Link: https://evil.example\nMessage: x Reply to the contact above. y\n%'
                from test.mail_calls), 'and so do a contact and a message: the mail cannot be given extra lines');

-- 7. Nobody calls the senders, not even the service role ------------------------------------------
select test.ok(not has_function_privilege('service_role', 'public.send_moderation_email(text, text, text, uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.moderation_digest()', 'execute')
  and not has_function_privilege('service_role', 'public.moderation_email_check()', 'execute')
  and not has_function_privilege('authenticated', 'public.moderation_email_check()', 'execute'), 'no API role can send or check moderation e-mail');

-- 8. Failed sends are noticed: Resend's answers are read back from pg_net ---------------------------
delete from public.moderation_email_log;
select test.ok(test.error_of($$select public.moderation_email_check()$$) is null, 'without pg_net''s response table the check does nothing, quietly');
delete from test.mail_calls;
select public.send_moderation_email('s', 't', 'report');
select test.ok((select count(*) = 1 and bool_and(request_id = (select currval('test.mail_req')) and kind = 'report' and not checked and status_code is null)
                from public.moderation_email_log), 'every send is logged with the request id pg_net returned');
create table net._http_response (id bigint, status_code int, content_type text, headers jsonb, content text, timed_out boolean, error_msg text, created timestamptz default now());
delete from public.moderation_email_log;
insert into public.moderation_email_log (request_id, kind, created_at) values
  (101, 'report', now() - interval '30 minutes'), (102, 'report', now() - interval '20 minutes'), (103, 'removal', now() - interval '10 minutes'),
  (104, 'digest', now() - interval '5 minutes'), (105, 'report', now() - interval '3 hours');
insert into net._http_response (id, status_code, timed_out) values (101, 200, false), (102, 403, false), (103, null, true);
select public.moderation_email_check();
select test.ok((select status_code = 200 and checked from public.moderation_email_log where request_id = 101), 'a 200 is recorded');
select test.ok((select status_code = 403 and checked from public.moderation_email_log where request_id = 102), 'a 403 is recorded');
select test.ok((select status_code is null and checked from public.moderation_email_log where request_id = 103), 'a timeout is recorded as no answer');
select test.ok((select not checked from public.moderation_email_log where request_id = 104), 'a request still waiting for its answer is left for the next check');
select test.ok((select status_code is null and checked from public.moderation_email_log where request_id = 105), 'one whose answer never came by the grace period is a failure');

select test.login('00000000-0000-0000-0000-0000000009a1');
select test.ok(test.state_of($$select * from public.moderation_email_health()$$) = '42501', 'readers cannot ask about e-mail health');
select test.ok(test.error_of($$select * from public.moderation_email_log$$) like '%permission denied%', 'nor read the log');
select test.logout();
set role anon;
select test.ok(test.error_of($$select * from public.moderation_email_health()$$) like '%permission denied%', 'nor can visitors');
reset role;
select test.login('00000000-0000-0000-0000-0000000009a3');
select test.ok((select failures = 2 and last_status is null and to_address = 'support@livami.app' from public.moderation_email_health()),
  'admins see the failures of the last 24 hours since the last mail that went through (the 403 and the timeout; the lost one was before the 200)');
select test.logout();
update public.moderation_email_log set created_at = now() - interval '2 days' where request_id in (103, 105);
select test.login('00000000-0000-0000-0000-0000000009a3');
select test.ok((select failures = 1 and last_status = 403 from public.moderation_email_health()), 'older failures drop out, and the latest status code is given');
select test.logout();
insert into public.moderation_email_log (request_id, kind, created_at, checked, status_code) values (106, 'report', now() - interval '2 minutes', true, 202);
select test.login('00000000-0000-0000-0000-0000000009a3');
select test.ok((select failures = 0 and last_status is null from public.moderation_email_health()),
  'a mail that went through after the failures (the key or domain fixed) clears the warning at once');
select test.logout();
delete from public.moderation_email_log where request_id = 106;
update public.moderation_email_settings set enabled = false;
select test.login('00000000-0000-0000-0000-0000000009a3');
select test.ok((select failures = 0 from public.moderation_email_health()), 'switched off: nothing to warn about');
select test.logout();
update public.moderation_email_settings set enabled = true;
select public.moderation_email_check();
select test.ok((select count(*) from public.moderation_email_log) = 5, 'checking leaves recent rows alone');
update public.moderation_email_log set created_at = now() - interval '40 days';
select public.moderation_email_check();
select test.ok((select count(*) from public.moderation_email_log) = 0, 'and forgets the old ones');
update public.moderation_email_settings set enabled = false;
drop table net._http_response;

drop function net.http_post(text, jsonb, jsonb, int);
drop schema net;
drop table vault.decrypted_secrets;
drop schema vault;
drop table test.mail_calls;
drop sequence test.mail_req;
delete from public.feedback;

\o
\echo 'MODERATION E-MAIL RULES PASSED'
