# Shared by the tools/teststack scripts (sourced, never run). Bash 3.2 compatible (macOS).
set -euo pipefail

TESTSTACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$TESTSTACK_DIR/../.." && pwd)"
# The services that talk to the database; they are stopped while it is swapped for a snapshot.
DB_CLIENTS="auth rest realtime storage"
BASE_DB=livami_base   # after the services' own migrations, before ours
CLEAN_DB=livami_clean # after ours: what every reset returns to

die() {
  echo "teststack: $*" >&2
  exit 1
}

# The slot (0-9) from $1, validated, exported for docker compose.
use_slot() {
  local slot="${1:-}"
  [[ "$slot" =~ ^[0-9]$ ]] || die "slot must be a single digit 0-9, got '${slot}'"
  export SLOT="$slot"
}

# Docker Compose v2, as the docker plugin or the standalone binary (e.g. Homebrew's for Colima).
compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose -f "$TESTSTACK_DIR/docker-compose.yml" "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose -f "$TESTSTACK_DIR/docker-compose.yml" "$@"
  else
    die "Docker Compose v2 is missing (docker compose, or docker-compose: brew install docker-compose)"
  fi
}

# Where leases are kept: one directory per slot, shared by every checkout on this machine.
LEASE_DIR="${TEST_STACK_LEASE_DIR:-${TMPDIR:-/tmp}/livami-teststack}"
POOL_SIZE="${TEST_STACK_POOL:-4}"

# Removes a lease directory: its owner file, then the (then empty) directory.
drop_lease() {
  rm -f "$1/owner"
  rmdir "$1" 2>/dev/null || true
}

# psql in the slot's database container (docker exec: much quicker than docker compose exec).
db_psql() {
  docker exec -i "livami-test-$SLOT-db-1" psql "$@"
}

# psql as the bootstrap superuser, on the maintenance database unless a database is given.
admin_sql() {
  db_psql -U supabase_admin -d "${1:-template1}" -v ON_ERROR_STOP=1 -At -q
}

db_exists() {
  [ "$(echo "select 1 from pg_database where datname = '$1';" | admin_sql)" = "1" ]
}

# What the clean snapshot must be built from: our migrations and the init SQL. A branch with other
# migrations gets its own clean snapshot rebuilt on its first reset.
migrations_hash() {
  cat "$TESTSTACK_DIR/db/schema.sql" "$REPO_DIR"/supabase/migrations/*.sql | shasum -a 256 | cut -c1-16
}

clean_hash() {
  echo "select shobj_description(oid, 'pg_database') from pg_database where datname = '$CLEAN_DB';" | admin_sql
}

# SQL that closes every connection to the live database and returns once the last one has left.
# pg_cron and pg_net keep background workers there that come back about a second after being
# terminated, so the statement that needs the database to itself must follow at once, in the same
# psql session. (pg_stat_activity is snapshotted per transaction: hence the clears.)
EVACUATE_SQL="do \$\$ begin
  for i in 1..500 loop
    perform pg_stat_clear_snapshot();
    perform pg_terminate_backend(pid) from pg_stat_activity where datname = 'postgres' and pid <> pg_backend_pid();
    perform pg_sleep(0.01);
    perform pg_stat_clear_snapshot();
    exit when not exists (select 1 from pg_stat_activity where datname = 'postgres' and pid <> pg_backend_pid());
  end loop;
end \$\$;"

# Runs admin SQL right after EVACUATE_SQL, again if a background worker won the race.
evacuate_and() {
  local sql="$1" i
  for i in 1 2 3 4; do
    printf '%s\n%s\n' "$EVACUATE_SQL" "$sql" | admin_sql 2>/dev/null && return 0
  done
  printf '%s\n%s\n' "$EVACUATE_SQL" "$sql" | admin_sql || die "could not get the database to itself"
}

stop_clients() {
  compose stop -t 2 $DB_CLIENTS >/dev/null 2>&1
}

start_clients() {
  compose up -d --wait $DB_CLIENTS kong >/dev/null 2>&1 || {
    compose ps >&2
    die "the services did not come back healthy (docker compose -p livami-test-$SLOT logs)"
  }
}

# Copies the live database to a template named $1. The services must be stopped.
snapshot() {
  local name="$1"
  if db_exists "$name"; then
    echo "alter database $name is_template false; drop database $name;" | admin_sql
  fi
  evacuate_and "create database $name template postgres strategy file_copy;"
  echo "alter database $name with allow_connections false is_template true;" | admin_sql
}

# Replaces the live database by a copy of template $1, keeping its owner and per-database
# settings (app.settings.jwt_secret, ...), which live outside the database itself. The services
# must be stopped.
restore() {
  local name="$1"
  admin_sql <<SQL
create temp table keep_owner as select pg_get_userbyid(datdba) as owner from pg_database where datname = 'postgres';
create temp table keep_settings as
  select r.rolname, unnest(s.setconfig) as setting
  from pg_db_role_setting s left join pg_roles r on r.oid = s.setrole
  where s.setdatabase = (select oid from pg_database where datname = 'postgres');
select pg_drop_replication_slot(slot_name) from pg_replication_slots where database = 'postgres';
drop database postgres with (force);
select format('create database postgres template $name strategy file_copy owner %I', owner) from keep_owner
\gexec
select format('alter %s database postgres set %I = %L',
              coalesce('role ' || quote_ident(rolname) || ' in', ''),
              split_part(setting, '=', 1), substr(setting, strpos(setting, '=') + 1))
  from keep_settings
\gexec
SQL
}

# Applies supabase/migrations in order, as the CLI's `db reset` does: as postgres, one transaction
# per file, recorded in supabase_migrations.schema_migrations.
migrate() {
  local file base out
  out=$({
    echo "create schema if not exists supabase_migrations;"
    echo "create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);"
    for file in "$REPO_DIR"/supabase/migrations/*.sql; do
      base="$(basename "$file" .sql)"
      echo "\\echo migration $base"
      echo "begin;"
      cat "$file"
      echo
      echo "insert into supabase_migrations.schema_migrations (version, name) values ('${base%%_*}', '${base#*_}');"
      echo "commit;"
    done
    if [ -f "$REPO_DIR/supabase/seed.sql" ]; then
      echo "\\echo seed"
      echo "begin;"
      cat "$REPO_DIR/supabase/seed.sql"
      echo
      echo "commit;"
    fi
  } | db_psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q 2>&1) || {
    echo "$out" | tail -8 >&2
    die "the last migration named above failed"
  }
}

# Migrates the live database (in its base state) and snapshots it as the clean template.
build_clean() {
  local hash
  hash="$(migrations_hash)"
  migrate
  stop_clients
  snapshot "$CLEAN_DB"
  echo "comment on database $CLEAN_DB is '$hash';" | admin_sql
}
