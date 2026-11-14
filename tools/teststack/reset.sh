#!/usr/bin/env bash
# Puts test stack <slot> back to a clean, migrated database (like `supabase db reset`) and empties
# its mailbox. Normally a copy of the clean snapshot; when supabase/migrations differ from the ones
# the snapshot was built from (another branch), it rebuilds the snapshot from the base first.
source "$(dirname "$0")/lib.sh"
use_slot "${1:-}"
started=$SECONDS
db_exists "$BASE_DB" || die "slot $SLOT has no base snapshot: run tools/teststack/up.sh $SLOT"

stop_clients
if [ "$(clean_hash)" = "$(migrations_hash)" ]; then
  restore "$CLEAN_DB"
else
  restore "$BASE_DB"
  start_clients
  build_clean
fi
start_clients
curl -sf -o /dev/null -X DELETE "http://127.0.0.1:55${SLOT}24/api/v1/messages" || die "could not empty Mailpit"
echo "slot $SLOT reset in $((SECONDS - started))s" >&2
