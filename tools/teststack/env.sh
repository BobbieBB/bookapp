#!/usr/bin/env bash
# Prints the exports the app tests need for test stack <slot>:  eval "$(tools/teststack/env.sh 1)"
# (--key prints just the anon key.) The keys are the legacy anon and service_role JWTs signed with
# the stack's fixed, test-only JWT secret (the Supabase CLI's local defaults), the same on every slot.
source "$(dirname "$0")/lib.sh"
use_slot "${1:-}"
anon=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
service=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
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
