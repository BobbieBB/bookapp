#!/usr/bin/env bash
# Erasing your comments while another of your devices is posting one must not leave that comment
# behind with its text. Runs after account.test.sql (needs its story and discussion); see run.sh.
set -euo pipefail
DB=bookapp_test
S=a1000000-0000-0000-0000-000000000001
D=a2000000-0000-0000-0000-000000000002
H=00000000-0000-0000-0000-0000000dd006
psql -q -v ON_ERROR_STOP=1 -d $DB \
  -c "insert into auth.users (id) values ('$H')" \
  -c "insert into public.profiles (id, username) values ('$H', 'hugo')" \
  -c "insert into public.library_entries (user_id, story_id, status, progress_section) values ('$H', '$S', 'finished', 3)" >/dev/null
# One phone posts a comment in a transaction it holds open; the other deletes the account meanwhile.
psql -q -v ON_ERROR_STOP=1 -d $DB -c "select test.login('$H')" -c "begin" \
  -c "insert into public.comments (discussion_id, body) values ('$D', 'Hugo posts while leaving')" \
  -c "select pg_sleep(1)" -c "commit" >/dev/null &
a=$!
sleep 0.3
psql -q -v ON_ERROR_STOP=1 -d $DB -c "select test.login('$H')" -c "select public.delete_my_account(true)" >/dev/null
wait $a || true
n=$(psql -tA -d $DB -c "select count(*) from public.comments where body = 'Hugo posts while leaving'")
if [ "$n" != 0 ]; then echo "FAIL: a comment posted during deletion kept its text"; exit 1; fi
echo 'ok - a comment posted while the account is deleted is erased or refused'
