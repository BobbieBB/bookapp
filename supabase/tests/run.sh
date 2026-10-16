#!/usr/bin/env bash
# Applies all migrations to a throwaway database and runs the SQL tests.
# Usage: PGHOST=/tmp PGPORT=5432 PGUSER=postgres supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=bookapp_test
psql -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -q -v ON_ERROR_STOP=1 -d $DB -f tests/auth_stub.sql
for f in migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d $DB -f "$f"; done
psql -v ON_ERROR_STOP=1 -d $DB -f tests/spoiler_rules.test.sql
bash tests/bump_race.test.sh
