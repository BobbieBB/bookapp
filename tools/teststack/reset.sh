#!/usr/bin/env bash
# Puts test stack <slot> back to a clean, migrated database (like `supabase db reset`) and empties
# its mailbox. Normally it only puts the clean rows back (reset_data in lib.sh), in place, while the
# services stay connected; when supabase/migrations differ from the ones the clean snapshot was
# built from (another branch), it rebuilds it from the base database first.
source "$(dirname "$0")/lib.sh"
use_slot "${1:-}"
started=$SECONDS
db_exists "$BASE_DB" || die "slot $SLOT has no base snapshot: run tools/teststack/up.sh $SLOT"

if [ "$(clean_hash)" = "$(migrations_hash)" ] && has_clean_data; then
  # The usual case: same migrations, so only the rows need to go back. No service notices.
  reset_data
else
  # Other migrations (another branch): back to the base database, migrate, new clean snapshot.
  # The services lose their database, so those that do not recover by themselves restart.
  # A crash of pg_net's worker can still cut a step off: the whole rebuild is retried.
  for attempt in 1 2 3; do
    (restore "$BASE_DB" && await_settled && build_clean) && break
    [ $attempt -eq 3 ] && die "slot $SLOT: could not rebuild the clean database"
    echo "teststack: rebuild interrupted, retrying" >&2
  done
  restart_rest
fi
await_api
curl -sf -o /dev/null -X DELETE "http://127.0.0.1:55${SLOT}24/api/v1/messages" || die "could not empty Mailpit"
echo "slot $SLOT reset in $((SECONDS - started))s" >&2
