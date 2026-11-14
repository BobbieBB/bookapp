#!/usr/bin/env bash
# Starts test stack <slot>, waits until it is healthy, and leaves it migrated: on a fresh volume it
# runs the services' own migrations, snapshots that base, applies supabase/migrations and snapshots
# the clean result (what reset.sh returns to). Idempotent: on a running stack it does no more than
# rebuild the clean snapshot when the migrations changed. Prints the time it took.
source "$(dirname "$0")/lib.sh"
use_slot "${1:-}"
started=$SECONDS

compose up -d --wait >/dev/null 2>&1 || {
  compose ps >&2
  die "slot $SLOT did not come up healthy (docker compose -p livami-test-$SLOT logs)"
}
if ! db_exists "$BASE_DB"; then
  snapshot "$BASE_DB"
  build_clean
  restart_rest
elif [ "$(clean_hash)" != "$(migrations_hash)" ]; then
  "$TESTSTACK_DIR/reset.sh" "$SLOT" 2>/dev/null
fi
# PostgREST has no healthcheck of its own (no shell in its image): wait for it through Kong.
await_api
echo "slot $SLOT up in $((SECONDS - started))s: API http://127.0.0.1:55${SLOT}21" >&2
