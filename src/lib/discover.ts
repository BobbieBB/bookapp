// Discover (docs/DECISIONS.md, 14 Oct 2026): YOUR FANDOMS, All fandoms, Lively in your fandoms.
// The ranking and its fallbacks live in the database (my_fandoms, search_fandoms, lively_in_fandoms).
import { supabase } from './supabase';

export type MyFandom = { fandom: string; source: 'picked' | 'library' | 'starter'; place: number };
export type FandomHit = { fandom: string; stories: number; rank: number };
export type LivelyTier = 'week' | 'month' | 'readers' | 'starter';
export type LivelyStory = {
  id: string;
  title: string;
  author_name: string;
  fandoms: string[];
  status: 'completed' | 'ongoing' | null;
  published_sections: number | null;
  tier: LivelyTier;
  activity: number;
  rank: number;
};

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}

export const myFandoms = () => rpc<MyFandom[]>('my_fandoms');

export const suggestedFandoms = async () => (await rpc<{ fandom: string }[]>('suggested_fandoms')).map((r) => r.fandom);

export const searchFandoms = async (query: string) =>
  (await rpc<FandomHit[]>('search_fandoms', { p_query: query })).map((h) => ({ ...h, stories: Number(h.stories) }));

export const lively = async (fandoms: string[]) =>
  (await rpc<LivelyStory[]>('lively_in_fandoms', { p_fandoms: fandoms })).map((s) => ({ ...s, activity: Number(s.activity) }));

/** Every fandom you picked (Profile shows them all; Discover's chips show at most 6). */
export async function favouriteFandoms(): Promise<string[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Not signed in.');
  const { data, error } = await supabase.from('profiles').select('favourite_fandoms').eq('id', auth.user.id).single();
  if (error) throw error;
  return data.favourite_fandoms as string[];
}

/** Profile > Your fandoms: one tap on a suggested (dashed "+") chip adds it. Atomic in the database. */
export const addFavouriteFandom = (fandom: string) => rpc<void>('add_favourite_fandom', { p_fandom: fandom });

export const removeFavouriteFandom = (fandom: string) => rpc<void>('remove_favourite_fandom', { p_fandom: fandom });
