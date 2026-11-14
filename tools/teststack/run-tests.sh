#!/usr/bin/env bash
# npm run test:stack -- <jest args>
# Runs the app tests on a test stack of their own: leases a free slot (or uses $TEST_SLOT, unleased),
# starts it if needed, resets it to a clean migrated database, exports its env and runs Jest.
# The lease is freed however the run ends; the stack stays up for the next run.
set -euo pipefail
dir="$(cd "$(dirname "$0")" && pwd)"
if [ -n "${TEST_SLOT:-}" ]; then
  slot="$TEST_SLOT"
else
  slot="$("$dir/lease.sh" $$)"
  trap '"$dir/release.sh" "$slot"' EXIT
  trap 'exit 130' INT TERM
fi
echo "teststack: running on slot $slot" >&2
"$dir/up.sh" "$slot"
"$dir/reset.sh" "$slot"
eval "$("$dir/env.sh" "$slot")"
cd "$dir/../.."
npx jest "$@"
