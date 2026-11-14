#!/usr/bin/env bash
# npm run test:stack -- <jest args>
# Runs the app tests on a test stack of their own: leases a free slot (or uses $TEST_SLOT, unleased),
# starts it if needed, resets it to a clean migrated database, exports its env and runs Jest.
# The lease is freed however the run ends: on TERM or INT, Jest gets the signal and is waited for
# first. The stack stays up for the next run.
set -euo pipefail
dir="$(cd "$(dirname "$0")" && pwd)"
jest_pid=""
# Forwards signal $1 to Jest (when it runs), waits for it, then exits; the EXIT trap frees the slot.
on_signal() {
  trap '' INT TERM
  if [ -n "$jest_pid" ]; then
    kill -s "$1" "$jest_pid" 2>/dev/null || true
    wait "$jest_pid" 2>/dev/null || true
  fi
  [ "$1" = INT ] && exit 130
  exit 143
}
if [ -n "${TEST_SLOT:-}" ]; then
  slot="$TEST_SLOT"
else
  slot="$("$dir/lease.sh" $$)"
  trap '"$dir/release.sh" "$slot"' EXIT
fi
trap 'on_signal INT' INT
trap 'on_signal TERM' TERM
echo "teststack: running on slot $slot" >&2
"$dir/up.sh" "$slot"
"$dir/reset.sh" "$slot"
eval "$("$dir/env.sh" "$slot")"
cd "$dir/../.."
# Jest itself (not npx, which would sit between), in the background, so this shell can take a signal while Jest runs and pass it on.
node_modules/.bin/jest "$@" &
jest_pid=$!
status=0
wait "$jest_pid" || status=$?
exit "$status"
