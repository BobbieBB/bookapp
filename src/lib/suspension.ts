// Suspending a reader (docs/DECISIONS.md, "Suspending a reader"). The database decides: only admins
// call set_reader_suspended, and a suspended reader's posts, reactions and reports are refused by Row
// Level Security. The app only explains it (the Home banner, the room) instead of failing silently.
import { useAuth } from './auth';
import { supabase } from './supabase';
import { useLookup } from './useLookup';

export type Suspension = { suspended: boolean; reason: string | null; since: string | null };

/** The longest reason an admin can give (the database refuses longer ones). */
export const REASON_MAX = 500;

const NOT_SUSPENDED: Suspension = { suspended: false, reason: null, since: null };

/** The signed-in reader's own state: whether they are suspended now, and the latest reason. */
export async function mySuspension(): Promise<Suspension> {
  const { data, error } = await supabase.rpc('my_suspension');
  if (error) throw error;
  return (data as Suspension[] | null)?.[0] ?? NOT_SUSPENDED;
}

/** Admins only. A reason (the reader sees it) is required to suspend, and ignored when lifting. */
export async function setReaderSuspended(userId: string, suspended: boolean, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('set_reader_suspended', {
    p_user: userId,
    p_suspended: suspended,
    p_reason: suspended ? (reason ?? null) : null,
  });
  if (error) throw error;
}

/**
 * The signed-in reader's suspension, reloaded whenever `version` changes (e.g. on focus). Undefined while
 * it loads or when it could not be loaded: the screens then behave as before and the database still refuses.
 */
export function useMySuspension(version: number | string = 0): Suspension | undefined {
  const { session } = useAuth();
  const userId = session?.user.id;
  const { data, previous } = useLookup(userId ? `suspension-${userId}-${version}` : null, async () => ({
    userId,
    ...(await mySuspension()),
  }));
  // The last answer stays on screen while a reload runs, but never one about a reader who signed out.
  const known = data ?? (previous?.userId === userId ? previous : undefined);
  return userId && known ? { suspended: known.suspended, reason: known.reason, since: known.since } : undefined;
}
