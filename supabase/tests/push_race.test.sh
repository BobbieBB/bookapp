#!/usr/bin/env bash
# Two replies to the same reader in the same room, posted at the same moment, buzz the phone once.
# Runs after push.test.sql (needs its readers, story, comment and device); see run.sh.
set -euo pipefail
DB=bookapp_test
A=00000000-0000-0000-0000-000000000901
B=00000000-0000-0000-0000-000000000902
D=00000000-0000-0000-0000-000000000903
S=99000000-0000-0000-0000-000000000001
C=99100000-0000-0000-0000-000000000001
C2=99100000-0000-0000-0000-000000000002
# Two readers reply to two different comments of the same reader, so nothing else (row locks, the
# per-author rate limit) makes them wait for each other.
reply() { echo "insert into public.comments (discussion_id, parent_id, body)
  select id, '$1', 'at the same time' from public.discussions where story_id = '$S' and section_number = 2"; }
psql -q -v ON_ERROR_STOP=1 -d $DB \
  -c "create table test.sent (body jsonb)" \
  -c "create schema net" \
  -c "create function net.http_post(url text, body jsonb, headers jsonb) returns bigint language plpgsql as
      \$f\$ begin insert into test.sent select m from jsonb_array_elements(body) m; return 1; end \$f\$" \
  -c "insert into auth.users (id) values ('$D')" \
  -c "insert into public.profiles (id, username) values ('$D', 'dora')" \
  -c "insert into public.library_entries (user_id, story_id, status, progress_section) values ('$D', '$S', 'finished', 3)" \
  -c "select test.login('$A')" \
  -c "insert into public.comments (id, discussion_id, body) select '$C2', id, 'another thought' from public.discussions
      where story_id = '$S' and section_number = 2" \
  -c "select test.logout()" \
  -c "delete from public.notifications where user_id = '$A'" \
  -c "update public.push_settings set enabled = true" >/dev/null
# One reply sits in a transaction held open; the other is posted meanwhile.
psql -q -v ON_ERROR_STOP=1 -d $DB -c "select test.login('$B')" -c "begin" -c "$(reply $C)" \
  -c "select pg_sleep(1)" -c "commit" >/dev/null &
a=$!
sleep 0.3
psql -q -v ON_ERROR_STOP=1 -d $DB -c "select test.login('$D')" -c "$(reply $C2)" >/dev/null
wait $a
n=$(psql -tA -d $DB -c "select count(*) from test.sent")
psql -q -v ON_ERROR_STOP=1 -d $DB -c "update public.push_settings set enabled = false" \
  -c "drop function net.http_post(text, jsonb, jsonb)" -c "drop schema net" -c "drop table test.sent" >/dev/null
if [ "$n" != 1 ]; then echo "FAIL: two replies at the same moment sent $n pushes"; exit 1; fi
echo 'ok - two replies at the same moment buzz once'
