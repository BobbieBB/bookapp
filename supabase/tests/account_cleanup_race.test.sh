#!/usr/bin/env bash
# The profileless-account sweep racing a reader who accepts the terms (their profile insert), both ways
# round. See run.sh. Each side is a psql session fed through a FIFO, so a transaction is held open for
# exactly as long as the test needs, and the test polls pg_stat_activity to know where the other
# session is instead of sleeping a fixed time.
set -euo pipefail
DB=bookapp_test
U1=00000000-0000-0000-0000-0000000ac0a1
U2=00000000-0000-0000-0000-0000000ac0a2
TMP=$(mktemp -d)
pids=()
cleanup() {
  exec 3>&- 4>&- 2>/dev/null || true
  for p in "${pids[@]}"; do kill "$p" 2>/dev/null || true; done
  rm -f "$TMP"/reader "$TMP"/reader.out "$TMP"/sweep "$TMP"/sweep.out "$TMP"/late.out
  rmdir "$TMP"
}
trap cleanup EXIT

q() { psql -tA -v ON_ERROR_STOP=1 -d $DB -c "$1"; }
fail() { echo "FAIL: $1"; exit 1; }
# Waits until the session named $1 (application_name) matches the condition $2 on pg_stat_activity.
wait_for() {
  local i
  for i in $(seq 1 200); do
    [ "$(q "select count(*) from pg_stat_activity where application_name = '$1' and $2")" = 1 ] && return 0
    sleep 0.05
  done
  fail "session $1 never reached: $2"
}

q "insert into auth.users (id, created_at) values ('$U1', now() - interval '60 days'), ('$U2', now() - interval '60 days')" >/dev/null

# 1. A profile insert in progress, then the sweep: the account is skipped, without waiting ----------
mkfifo "$TMP/reader"
PGAPPNAME=race_reader psql -q -v ON_ERROR_STOP=1 -d $DB <"$TMP/reader" >"$TMP/reader.out" 2>&1 &
reader=$!; pids+=("$reader")
exec 3>"$TMP/reader"
echo "begin; insert into public.profiles (id, username) values ('$U1', 'lastminute');" >&3
wait_for race_reader "state = 'idle in transaction'"
# The sweep must not wait for the reader's transaction (the timeout turns a wait into a failure).
n=$(PGOPTIONS='-c statement_timeout=5s' q "select public.sweep_profileless_accounts()") \
  || fail "the sweep waited for (or failed on) a profile being created"
[ "$n" = 1 ] || fail "the sweep returned $n, expected 1 (only the other old account)"
[ "$(q "select count(*) from auth.users where id = '$U1'")" = 1 ] \
  || fail "the sweep deleted an account whose profile was being created"
echo "commit;" >&3
exec 3>&-
wait "$reader" || { cat "$TMP/reader.out"; fail "the reader's profile insert failed"; }
[ "$(q "select count(*) from public.profiles where id = '$U1'")" = 1 ] || fail "the reader's profile is missing"
echo 'ok - an account getting its profile during the sweep is skipped and kept'

# 2. The sweep holds its lock in an open transaction, then a profile insert: it waits, then fails ----
q "insert into auth.users (id, created_at) values ('$U2', now() - interval '60 days')" >/dev/null
mkfifo "$TMP/sweep"
PGAPPNAME=race_sweep psql -tA -q -v ON_ERROR_STOP=1 -d $DB <"$TMP/sweep" >"$TMP/sweep.out" 2>&1 &
sweep=$!; pids+=("$sweep")
exec 4>"$TMP/sweep"
echo "begin; select public.sweep_profileless_accounts();" >&4
wait_for race_sweep "state = 'idle in transaction'"
PGAPPNAME=race_late psql -q -v ON_ERROR_STOP=1 -d $DB \
  -c "insert into public.profiles (id, username) values ('$U2', 'toolate')" >"$TMP/late.out" 2>&1 &
late=$!; pids+=("$late")
wait_for race_late "wait_event_type = 'Lock'"
echo "commit;" >&4
exec 4>&-
wait "$sweep" || { cat "$TMP/sweep.out"; fail "the sweep failed"; }
[ "$(tr -d '[:space:]' <"$TMP/sweep.out")" = 1 ] || fail "the sweep returned $(cat "$TMP/sweep.out"), expected 1"
if wait "$late"; then fail "a profile insert for an account being swept succeeded"; fi
grep -q 'foreign key' "$TMP/late.out" || { cat "$TMP/late.out"; fail "the late profile insert failed for another reason"; }
[ "$(q "select count(*) from auth.users where id = '$U2'")" = 0 ] || fail "the swept account is still there"
[ "$(q "select count(*) from public.profiles where id = '$U2'")" = 0 ] || fail "an orphan profile was left behind"
echo 'ok - a profile insert during an open sweep waits, then fails on the deleted account'

q "delete from auth.users where id = '$U1'" >/dev/null
