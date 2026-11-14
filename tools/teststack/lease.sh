#!/usr/bin/env bash
# Claims a free test-stack slot and prints it. Slots 1..TEST_STACK_POOL (default 4) are leased;
# slot 0 is left for CI and manual use. A lease is a directory (mkdir is atomic) holding the PID of
# its owner: the process given as $1, else the caller. A lease whose owner has died is reclaimed,
# so a killed test run never keeps its slot. Free it with release.sh <slot>.
#   TEST_STACK_LEASE_WAIT  seconds to wait for a free slot (default 1800), polling every 2 s.
source "$(dirname "$0")/lib.sh"
owner="${1:-$PPID}"
[[ "$owner" =~ ^[0-9]+$ ]] || die "owner must be a PID, got '$owner'"
[[ "$POOL_SIZE" =~ ^[1-9]$ ]] || die "TEST_STACK_POOL must be 1-9, got '$POOL_SIZE'"
mkdir -p "$LEASE_DIR"
deadline=$((SECONDS + ${TEST_STACK_LEASE_WAIT:-1800}))
waited=0
while :; do
  for slot in $(seq 1 "$POOL_SIZE"); do
    lock="$LEASE_DIR/slot-$slot"
    if mkdir "$lock" 2>/dev/null; then
      echo "$owner" >"$lock/owner"
      echo "$slot"
      exit 0
    fi
    holder="$(cat "$lock/owner" 2>/dev/null || true)"
    # A lease with no owner yet is being taken right now; only a dead owner's lease is stale.
    if [ -n "$holder" ] && ! kill -0 "$holder" 2>/dev/null; then
      # Rename first, so of two processes reclaiming the same stale lease only one wins.
      # If the lease changed hands between the check and the rename, put it back.
      if mv "$lock" "$lock.stale.$$" 2>/dev/null; then
        if [ "$(cat "$lock.stale.$$/owner" 2>/dev/null || true)" = "$holder" ]; then
          drop_lease "$lock.stale.$$"
        else
          mv "$lock.stale.$$" "$lock" 2>/dev/null || drop_lease "$lock.stale.$$"
        fi
      fi
    fi
  done
  [ $SECONDS -ge $deadline ] && die "no free slot among 1..$POOL_SIZE (leases in $LEASE_DIR)"
  if [ $waited -eq 0 ]; then
    echo "teststack: all $POOL_SIZE slots are leased, waiting for one..." >&2
    waited=1
  fi
  sleep 2
done
