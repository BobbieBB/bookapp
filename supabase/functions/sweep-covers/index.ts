// Removes cover files that no custom_covers row points to any more (docs/DECISIONS.md, "Dev defaults").
// Called once a day by public.request_cover_sweep (pg_cron + pg_net). The x-sweep-secret header is the
// only way in: the function runs with verify_jwt off (supabase/config.toml) and acts as the service role.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { authorized, removeInChunks } from './sweep.ts';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (!authorized(req.headers.get('x-sweep-secret'), Deno.env.get('COVER_SWEEP_SECRET'))) {
    return json(401, { error: 'unauthorized' });
  }
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json(500, { error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set' });

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  // The default grace period (1 day) and batch size (500) live in orphan_cover_paths; what is left over
  // goes in tomorrow's sweep.
  const { data: paths, error } = await supabase.rpc('orphan_cover_paths');
  if (error) {
    console.error('orphan_cover_paths failed', error.message);
    return json(500, { error: 'could not list orphan covers' });
  }
  const result = await removeInChunks(paths as string[], async (group) => {
    const { data, error: removeError } = await supabase.storage.from('covers').remove(group);
    if (removeError) console.error('removing covers failed', removeError.message);
    return { removed: data?.length ?? 0, error: removeError?.message ?? null };
  });
  console.log('cover sweep', result);
  return json(200, result);
});
