#!/usr/bin/env bash
# npm run test:stack-scripts
# Races lease.sh against itself in a scratch lease directory and checks that every slot ends up with
# exactly one owner: concurrent takers, stale leases (dead owner, or no owner file for 10 s) reclaimed
# by many processes at once, a fresh ownerless lease left alone, another user's process (kill -0 ->
# EPERM) counted as alive. Needs no Docker.
set -euo pipefail
dir="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d "${TMPDIR:-/tmp}/lease-test.XXXXXX")"
cleanup() {
  [ -s "$work/owners" ] && kill $(cat "$work/owners") 2>/dev/null || true
  # Only what this test creates: owner files and empty directories (rmdir refuses anything else).
  rm -f "$work/owners" "$work"/out.*/* "$work"/leases.*/slot-*/owner 2>/dev/null || true
  rm -f "$work"/leases.*/*.reclaim "$work/shim/mkdir" 2>/dev/null || true
  rmdir "$work/shim" "$work"/out.* "$work"/leases.*/*.reclaim "$work"/leases.*/slot-* "$work"/leases.* "$work" 2>/dev/null || true
}
trap cleanup EXIT
# A generous orphan age: slot 3 below must stay "just taken" for the whole race, even on a slow machine.
export TEST_STACK_LEASE_WAIT=0 TEST_STACK_POOL=4 TEST_STACK_ORPHAN_AGE=300
failures=0
# Each scenario gets a fresh, empty lease directory, so nothing has to be deleted between them.
scenario=0
fresh_leases() {
  scenario=$((scenario + 1))
  export TEST_STACK_LEASE_DIR="$work/leases.$scenario"
  mkdir "$TEST_STACK_LEASE_DIR"
}
fail() {
  echo "FAIL: $*" >&2
  failures=$((failures + 1))
}

# A live owner PID that stays alive for the test (detached from the caller's output, so a command
# substitution around it returns at once; killed by cleanup).
live_owner() {
  sleep 600 </dev/null >/dev/null 2>&1 &
  echo $! >>"$work/owners"
  echo $!
}
# The PID of a process that has exited.
dead_pid() {
  sh -c 'exit 0' &
  local pid=$!
  wait "$pid"
  echo "$pid"
}

# Starts $1 lease.sh at once, each for its own live owner; waits; prints the slots won, one per line.
race() {
  local n="$1" i pids=() out="$work/out.$RANDOM"
  mkdir -p "$out"
  for i in $(seq 1 "$n"); do
    "$dir/lease.sh" "$(live_owner)" >"$out/$i" 2>/dev/null &
    pids+=($!)
  done
  for i in "${pids[@]}"; do wait "$i" || true; done
  cat "$out"/* 2>/dev/null | sort
}

# No nested lease directories (an mv landing inside another lease) and no leftover guards.
check_tidy() {
  local stray
  stray="$(find "$TEST_STACK_LEASE_DIR" -mindepth 2 -type d | head -3)"
  [ -z "$stray" ] || fail "$1: nested directories: $stray"
  stray="$(find "$TEST_STACK_LEASE_DIR" -maxdepth 1 -name '*.reclaim' | head -3)"
  [ -z "$stray" ] || fail "$1: leftover guards: $stray"
}

expect_slots() { # label, expected (space-separated), actual (newline-separated)
  local got
  got="$(echo $3)"
  [ "$got" = "$2" ] || fail "$1: expected slots '$2', got '$got'"
}

for round in 1 2 3 4 5; do
  # 1. Twelve takers, four free slots: each slot won exactly once.
  fresh_leases
  expect_slots "round $round, free slots" "1 2 3 4" "$(race 12)"
  check_tidy "round $round, free slots"

  # 2. Stale leases reclaimed by twelve processes at once: slot 1's owner is dead, slot 2 has had no
  #    owner file for a minute; slot 3 was just taken (no owner file yet), slot 4 is held by a live
  #    process. Exactly slots 1 and 2 are won, once each.
  fresh_leases
  mkdir -p "$TEST_STACK_LEASE_DIR"/slot-{1,2,3,4}
  dead_pid >"$TEST_STACK_LEASE_DIR/slot-1/owner"
  touch -t 202001010000 "$TEST_STACK_LEASE_DIR/slot-2"
  echo "$(live_owner)" >"$TEST_STACK_LEASE_DIR/slot-4/owner"
  expect_slots "round $round, stale leases" "1 2" "$(race 12)"
  [ ! -e "$TEST_STACK_LEASE_DIR/slot-3/owner" ] && [ -d "$TEST_STACK_LEASE_DIR/slot-3" ] ||
    fail "round $round: the fresh ownerless lease of slot 3 was taken"
  check_tidy "round $round, stale leases"
done

# 3. A lease owned by another user's process (kill -0 fails with EPERM) is alive: not reclaimed.
if [ "$(id -u)" != 0 ] && ! kill -0 1 2>/dev/null; then
  fresh_leases
  mkdir -p "$TEST_STACK_LEASE_DIR"/slot-{1,2,3,4}
  for s in 1 2 3 4; do echo 1 >"$TEST_STACK_LEASE_DIR/slot-$s/owner"; done
  expect_slots "another user's owner" "" "$(race 4)"
else
  echo "skipped: the EPERM case needs a process this user may not signal (PID 1, not as root)" >&2
fi

# 4. release.sh frees a slot, which the next lease then gets.
fresh_leases
race 4 >/dev/null
"$dir/release.sh" 3
expect_slots "after release" "3" "$(race 2)"
check_tidy "after release"

# 5. A mkdir that reports success for a directory that already exists, as uutils' mkdir (Ubuntu 26.04)
#    does for the loser of a race: neither a lease nor a reclaim guard may change hands because of it.
#    The stand-in makes the race certain instead of rare.
real_mkdir="$(command -v mkdir)"
shim="$work/shim"
"$real_mkdir" "$shim"
printf '#!/usr/bin/env bash\nfor a in "$@"; do [ -d "$a" ] && exit 0; done\nexec %q "$@"\n' "$real_mkdir" >"$shim/mkdir"
chmod +x "$shim/mkdir"
fresh_leases
first="$(PATH="$shim:$PATH" "$dir/lease.sh" "$(live_owner)" 2>/dev/null || true)"
second="$(PATH="$shim:$PATH" "$dir/lease.sh" "$(live_owner)" 2>/dev/null || true)"
expect_slots "racy mkdir, two takers" "1 2" "$first $second"
# Slot 1 is stale (dead owner) but someone else is reclaiming it right now: its guard is held, as a
# file (this version) or as a directory (left by the version before it).
for guard_kind in file directory; do
  fresh_leases
  "$real_mkdir" "$TEST_STACK_LEASE_DIR/slot-1"
  if [ $guard_kind = file ]; then : >"$TEST_STACK_LEASE_DIR/slot-1.reclaim"; else "$real_mkdir" "$TEST_STACK_LEASE_DIR/slot-1.reclaim"; fi
  dead="$(dead_pid)"
  echo "$dead" >"$TEST_STACK_LEASE_DIR/slot-1/owner"
  expect_slots "racy mkdir, held $guard_kind guard" "2" "$(PATH="$shim:$PATH" "$dir/lease.sh" "$(live_owner)" 2>/dev/null || true)"
  [ "$(cat "$TEST_STACK_LEASE_DIR/slot-1/owner" 2>/dev/null)" = "$dead" ] ||
    fail "racy mkdir, held $guard_kind guard: slot 1 was taken back while another process held its guard"
  { rm -f "$TEST_STACK_LEASE_DIR/slot-1.reclaim" || rmdir "$TEST_STACK_LEASE_DIR/slot-1.reclaim"; } 2>/dev/null || true
done
rm -f "$shim/mkdir"
rmdir "$shim"

if [ $failures -gt 0 ]; then
  echo "lease tests: $failures failed" >&2
  exit 1
fi
echo "lease tests: all passed" >&2
