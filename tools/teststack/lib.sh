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
# The legacy anon key (a JWT signed with the stack's test-only secret), for health checks.
ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0

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

# After the database was swapped: PostgREST backs off up to 32 s between reconnects, GoTrue's pool
# keeps dead connections (sign-ups time out) and Realtime loses its replication of the old
# database, so these three restart (Storage reconnects by itself). Waits for Realtime's health.
restart_rest() {
  local i
  docker restart -t 1 "livami-test-$SLOT-rest-1" "livami-test-$SLOT-auth-1" "livami-test-$SLOT-realtime-1" >/dev/null
  for i in $(seq 1 600); do
    [ "$(docker inspect -f '{{.State.Health.Status}}' "livami-test-$SLOT-realtime-1")" = healthy ] && return 0
    sleep 0.5
  done
  die "slot $SLOT: Realtime did not come back healthy"
}

# Waits until the API answers again after the database was swapped: the services stay up and
# reconnect by themselves (PostgREST reloads its schema cache when it does).
await_api() {
  local i rest auth
  for i in $(seq 1 240); do
    # Any answer from PostgREST itself (even "permission denied") means its schema cache is loaded;
    # 000 is no connection, 5xx is Kong or PostgREST still waiting for the database.
    rest=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:55${SLOT}21/rest/v1/profiles?limit=0" \
      -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" || true)
    auth=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:55${SLOT}21/auth/v1/health" -H "apikey: $ANON_KEY" || true)
    if [ "$auth" = "200" ] && [ "$rest" != "000" ] && [ "$rest" -lt 500 ]; then
      return 0
    fi
    sleep 0.25
  done
  die "slot $SLOT: the API did not answer (docker compose -p livami-test-$SLOT logs)"
}

# Copies the live database to a template named $1. The services stay up: new connections are
# refused while it is copied, and they reconnect afterwards.
snapshot() {
  local name="$1"
  if db_exists "$name"; then
    echo "alter database $name is_template false; drop database $name;" | admin_sql
  fi
  echo "alter database postgres allow_connections false;" | admin_sql
  evacuate_and "create database $name template postgres strategy file_copy;" ||
    { echo "alter database postgres allow_connections true;" | admin_sql; exit 1; }
  echo "alter database postgres allow_connections true;
        alter database $name with allow_connections false is_template true;" | admin_sql
}

# Replaces the live database by a copy of template $1, keeping its owner and per-database
# settings (app.settings.jwt_secret, ...), which live outside the database itself. The services
# stay up: their connections are dropped and they reconnect to the new database.
restore() {
  local name="$1"
  admin_sql <<SQL
create temp table keep_owner as select pg_get_userbyid(datdba) as owner from pg_database where datname = 'postgres';
create temp table keep_settings as
  select r.rolname, unnest(s.setconfig) as setting
  from pg_db_role_setting s left join pg_roles r on r.oid = s.setrole
  where s.setdatabase = (select oid from pg_database where datname = 'postgres');
select pg_terminate_backend(active_pid) from pg_replication_slots where database = 'postgres' and active;
select pg_sleep(0.2);
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

# After restore: pg_net's background worker crashes (signal 11) when its database is replaced, and
# Postgres then restarts every backend. Waits until its worker is back in the new database and the
# server takes connections, so nothing that follows is cut off.
await_settled() {
  local i seen=0
  for i in $(seq 1 120); do
    if [ "$(echo "select count(*) from pg_stat_activity where datname = 'postgres' and backend_type like 'pg_net%';" | admin_sql 2>/dev/null)" = "1" ]; then
      seen=$((seen + 1))
      [ $seen -ge 3 ] && return 0
    else
      seen=0
    fi
    sleep 1
  done
  die "slot $SLOT: the database did not settle after the swap"
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

# The rows of the clean database, which a reset puts back: kept in the db volume, next to PGDATA.
CLEAN_DATA=/var/lib/postgresql/data/livami_clean_data.sql
# The schemas whose rows tests change. The services' own migration bookkeeping is left alone.
DATA_SCHEMAS="public auth storage"
KEEP_TABLES="auth.schema_migrations storage.migrations"

dump_clean_data() {
  local args="" s t
  for s in $DATA_SCHEMAS; do args="$args -n $s"; done
  for t in $KEEP_TABLES; do args="$args -T $t"; done
  docker exec "livami-test-$SLOT-db-1" sh -c "pg_dump -U supabase_admin -d postgres --data-only $args -f $CLEAN_DATA.tmp 2>/tmp/pg_dump.err && mv $CLEAN_DATA.tmp $CLEAN_DATA" ||
    { docker exec "livami-test-$SLOT-db-1" cat /tmp/pg_dump.err >&2; die "could not dump the clean data"; }
}

has_clean_data() {
  docker exec "livami-test-$SLOT-db-1" test -s "$CLEAN_DATA"
}

# Puts the clean rows back in place, in one transaction, in the live database: every table of
# DATA_SCHEMAS is emptied and refilled from the dump. The services keep their connections, so
# nothing has to reconnect or restart. Schema changes a test left behind are not undone.
reset_data() {
  local schemas keep
  schemas="'$(echo $DATA_SCHEMAS | sed "s/ /','/g")'"
  keep="'$(echo $KEEP_TABLES | sed "s/ /','/g")'"
  db_psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q -1 -f - >/dev/null <<SQL || die "could not reset the data"
set lock_timeout = '20s';
set session_replication_role = replica;
do \$\$ declare tables text; begin
  select string_agg(format('%I.%I', schemaname, tablename), ', ') into tables from pg_tables
  where schemaname in ($schemas) and schemaname || '.' || tablename not in ($keep);
  if tables is not null then execute 'truncate ' || tables || ' restart identity cascade'; end if;
end \$\$;
\\i $CLEAN_DATA
SQL
}

# Migrates the live database (in its base state), keeps its rows for reset_data and snapshots it
# as the clean template.
build_clean() {
  local hash
  hash="$(migrations_hash)"
  migrate
  echo "notify pgrst, 'reload schema';" | db_psql -U postgres -d postgres -q
  dump_clean_data
  snapshot "$CLEAN_DB"
  echo "comment on database $CLEAN_DB is '$hash';" | admin_sql
}
