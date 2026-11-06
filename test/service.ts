// A service-role client for the local stack, for tests of what only the server may do (the cover
// sweep). The key comes from SUPABASE_SECRET_KEY (CI exports it from `supabase status`), or else from
// asking the local stack itself.
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';

function secretKey(): string {
  const fromEnv = process.env.SUPABASE_SECRET_KEY;
  if (fromEnv) return fromEnv;
  const status = execFileSync('npx', ['-y', 'supabase@2.121.0', 'status', '-o', 'env'], { encoding: 'utf8' });
  const key = /^SECRET_KEY="(.+)"$/m.exec(status)?.[1];
  if (!key) throw new Error('No SECRET_KEY in `supabase status`: is the local stack running (npm run db:start)?');
  return key;
}

export function serviceClient() {
  return createClient(process.env.EXPO_PUBLIC_SUPABASE_URL ?? '', secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
