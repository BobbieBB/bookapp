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
psql -v ON_ERROR_STOP=1 -d $DB -f tests/story_rules.test.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/book_chapters.test.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/discussions.test.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/discover.test.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/safety.test.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/home.test.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/covers.test.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/analytics.test.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/push.test.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/cover_sweep.test.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/account.test.sql
bash tests/account_race.test.sh
bash tests/bump_race.test.sh
bash tests/push_race.test.sh
