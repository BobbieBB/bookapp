// Discover (docs/DECISIONS.md, 14 Oct 2026): YOUR FANDOMS, All fandoms, Lively in your fandoms.
// The ranking and its fallbacks live in the database (my_fandoms, search_fandoms, lively_in_fandoms).
import { supabase } from './supabase';

export type MyFandom = { fandom: string; source: 'picked' | 'library' | 'starter'; place: number };
export type FandomHit = { fandom: string; stories: number; rank: number };
/** A ship found by its characters' names or its nickname ("dramione"); `nickname` is the one that matched. */
export type ShipHit = { ship: string; nickname: string | null; stories: number; rank: number };
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

export const searchShips = async (query: string) =>
  (await rpc<ShipHit[]>('search_ships', { p_query: query })).map((h) => ({ ...h, stories: Number(h.stories) }));

/** Fics with this ship you don't read yet, most read first (the shape of Lively, tier 'readers'). */
export const ficsWithShip = async (ship: string, completeOnly = false) =>
  (await rpc<LivelyStory[]>('fics_with_ship', { p_ship: ship, p_complete_only: completeOnly })).map((s) => ({
    ...s,
    activity: Number(s.activity),
  }));

/** The full tag for a ship's nickname typed when adding a fic ("Dramione"), or null. */
export const shipForNickname = (nickname: string) => rpc<string | null>('ship_for_nickname', { p_nickname: nickname });

/** A story already in Livami, found by its title or author (search_stories). */
export type StoryHit = {
  id: string;
  kind: 'book' | 'fanfic';
  title: string;
  author_name: string;
  fandoms: string[];
  status: 'completed' | 'ongoing' | null;
  language: string | null;
  readers: number;
  rank: number;
};

/** Searches only Livami's own stories (never AO3 or Open Library); from 3 characters, at most 20 hits. */
export const searchStories = async (query: string) =>
  (await rpc<StoryHit[]>('search_stories', { p_query: query })).map((h) => ({ ...h, readers: Number(h.readers) }));

/**
 * Complete only narrows every fallback tier in the database, so the list widens the same way with it on.
 * It is sent only when on: with it off the call is the one a database without the filter also answers.
 */
export const lively = async (fandoms: string[], completeOnly = false) =>
  (await rpc<LivelyStory[]>('lively_in_fandoms', { p_fandoms: fandoms, ...(completeOnly ? { p_complete_only: true } : {}) })).map((s) => ({
    ...s,
    activity: Number(s.activity),
  }));

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

/** Discover for books (decision F, 15 Nov 2026): "Being read now", books you don't have yet. */
export type BookTier = 'reading' | 'readers';
export type BookNow = {
  id: string;
  title: string;
  author_name: string;
  language: 'en' | 'bg' | null;
  cover_url: string | null;
  reading: number;
  readers: number;
  tier: BookTier;
  rank: number;
};

export const booksBeingRead = async (language: string) =>
  (await rpc<BookNow[]>('books_being_read', { p_language: language })).map((b) => ({ ...b, reading: Number(b.reading), readers: Number(b.readers) }));
