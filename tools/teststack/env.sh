#!/usr/bin/env bash
# Prints the exports the app tests need for test stack <slot>:  eval "$(tools/teststack/env.sh 1)"
# (--key prints just the anon key.) The keys are lib.sh's (the same on every slot).
source "$(dirname "$0")/lib.sh"
use_slot "${1:-}"
anon="$TESTSTACK_ANON_KEY"
service="$TESTSTACK_SERVICE_KEY"
if [ "${2:-}" = "--key" ]; then
  echo "$anon"
  exit 0
fi
cat <<ENV
export TEST_SLOT=$SLOT
export EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:55${SLOT}21
export EXPO_PUBLIC_SUPABASE_KEY=$anon
export SUPABASE_SECRET_KEY=$service
export MAILPIT_URL=http://127.0.0.1:55${SLOT}24
export SUPABASE_DB_CONTAINER=livami-test-$SLOT-db-1
ENV
