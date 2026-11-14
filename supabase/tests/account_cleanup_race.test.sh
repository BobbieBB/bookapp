#!/usr/bin/env bash
# The profileless-account sweep must not delete an account whose profile is being created at that
# very moment (the reader accepting the terms on day 31). See run.sh.
set -euo pipefail
DB=bookapp_test
U=00000000-0000-0000-0000-0000000ac0a1
psql -q -v ON_ERROR_STOP=1 -d $DB -c "insert into auth.users (id, created_at) values ('$U', now() - interval '60 days')" >/dev/null
# The reader creates their profile in a transaction held open; the daily sweep runs meanwhile.
psql -q -v ON_ERROR_STOP=1 -d $DB -c "begin" \
  -c "insert into public.profiles (id, username) values ('$U', 'lastminute')" \
  -c "select pg_sleep(1)" -c "commit" >/dev/null &
a=$!
sleep 0.3
psql -q -v ON_ERROR_STOP=1 -d $DB -c "select public.sweep_profileless_accounts()" >/dev/null
wait $a
n=$(psql -tA -d $DB -c "select count(*) from public.profiles where id = '$U'")
if [ "$n" != 1 ]; then echo "FAIL: the sweep deleted an account whose profile was being created"; exit 1; fi
psql -q -d $DB -c "delete from auth.users where id = '$U'" >/dev/null
echo 'ok - an account getting its profile during the sweep is kept'
