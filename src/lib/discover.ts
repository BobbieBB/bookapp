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

async function updateFavourites(change: (current: string[]) => string[]) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Not signed in.');
  const { data, error } = await supabase.from('profiles').select('favourite_fandoms').eq('id', auth.user.id).single();
  if (error) throw error;
  const { error: saveError } = await supabase
    .from('profiles')
    .update({ favourite_fandoms: change(data.favourite_fandoms as string[]) })
    .eq('id', auth.user.id);
  if (saveError) throw saveError;
}

/** Profile > Your fandoms: one tap on a suggested (dashed "+") chip adds it. */
export const addFavouriteFandom = (fandom: string) =>
  updateFavourites((current) => (current.includes(fandom) ? current : [...current, fandom]));

export const removeFavouriteFandom = (fandom: string) => updateFavourites((current) => current.filter((f) => f !== fandom));
