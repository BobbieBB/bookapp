// Direct SQL on the local stack's database, for what no reader may do through the API (e.g. making
// someone an admin, or recording events in the past). Runs as the database owner, in the stack's
// own container, so it needs no extra keys: SUPABASE_DB_CONTAINER for a test stack
// (tools/teststack/env.sh), else the one `supabase start` names after config.toml's project_id.
import { execFileSync } from 'node:child_process';

const container = process.env.SUPABASE_DB_CONTAINER ?? 'supabase_db_bookapp';

export function sql(statement: string): string {
  return execFileSync(
    'docker',
    ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'],
    { input: statement, encoding: 'utf8' },
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function setAdmin(userId: string, admin: boolean) {
  if (!UUID.test(userId)) throw new Error(`not a user id: ${userId}`);
  const out = sql(`update public.profiles set is_admin = ${admin} where id = '${userId}' returning id;`);
  if (!out.includes(userId)) throw new Error(`no profile ${userId}`);
}
