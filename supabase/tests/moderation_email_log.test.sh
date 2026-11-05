#!/usr/bin/env bash
# When pg_net fails, the warning in the database log names the report and the SQLSTATE, never the error
# text: an error that echoed the request headers would put the Resend API key in the logs.
# Runs after moderation_email.test.sql (needs its reporter and comment); see run.sh.
set -euo pipefail
DB=bookapp_test
R=00000000-0000-0000-0000-0000000009a1
C=9a000000-0000-0000-0000-000000000001
out=$(psql -q -v ON_ERROR_STOP=1 -d $DB 2>&1 <<SQL
create schema net;
create function net.http_post(url text, body jsonb, headers jsonb, timeout_milliseconds int) returns bigint language plpgsql as
  \$f\$ begin raise exception 'request failed, headers: %', headers::text; end \$f\$;
create schema vault;
create table vault.decrypted_secrets (name text, decrypted_secret text);
insert into vault.decrypted_secrets values ('resend_api_key', 're_secret_key_value');
update public.moderation_email_settings set enabled = true;
delete from public.reports where reporter_id = '$R';
insert into public.reports (reporter_id, comment_id, reason) values ('$R', '$C', 'spam');
insert into public.removal_requests (requester_id, story_url, contact) values ('$R', 'https://archiveofourown.org/works/9997', 'a@b.co');
update public.moderation_email_settings set enabled = false;
drop function net.http_post(text, jsonb, jsonb, int);
drop schema net;
drop table vault.decrypted_secrets;
drop schema vault;
SQL
)
if echo "$out" | grep -q 're_secret_key_value'; then echo "FAIL: the API key reached the log: $out"; exit 1; fi
n=$(echo "$out" | grep -c 'WARNING:.*not sent' || true)
if [ "$n" != 2 ]; then echo "FAIL: expected 2 warnings, got $n: $out"; exit 1; fi
if ! echo "$out" | grep -q 'not sent (P0001)'; then echo "FAIL: warning lacks the SQLSTATE: $out"; exit 1; fi
echo "MODERATION E-MAIL LOG PASSED"
