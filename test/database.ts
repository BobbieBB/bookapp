// Direct SQL on the local stack's database, for what no reader may do through the API (e.g. making
// someone an admin, or recording events in the past). Runs as the database owner, in the stack's
// own container (named after supabase/config.toml's project_id), so it needs no extra keys.
import { execFileSync } from 'node:child_process';

export function sql(statement: string): string {
  return execFileSync(
    'docker',
    ['exec', '-i', 'supabase_db_bookapp', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'],
    { input: statement, encoding: 'utf8' },
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function setAdmin(userId: string, admin: boolean) {
  if (!UUID.test(userId)) throw new Error(`not a user id: ${userId}`);
  const out = sql(`update public.profiles set is_admin = ${admin} where id = '${userId}' returning id;`);
  if (!out.includes(userId)) throw new Error(`no profile ${userId}`);
}
