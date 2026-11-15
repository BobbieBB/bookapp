// Explicit works ask an 18+ question once (docs/DECISIONS.md, "Explicit works: an 18+ confirmation").
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

/**
 * Whether opening this work's AO3 link or discussion asks the 18+ question first: it is rated Explicit and
 * the reader has not said yes. Until the profile has loaded, it asks (saying yes again is harmless).
 */
export function asksAdult(rating: string | null | undefined, profile: Pick<Profile, 'adult_confirmed'> | null | undefined): boolean {
  return rating === 'Explicit' && profile?.adult_confirmed !== true;
}

/** "I'm 18 or over, continue": records the reader's yes on their account. It cannot be taken back. */
export async function confirmAdult(): Promise<void> {
  const { error } = await supabase.rpc('confirm_adult');
  if (error) throw error;
}
