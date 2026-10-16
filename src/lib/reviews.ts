// Book ratings (0.5–5 in half steps) and reviews (docs/DECISIONS.md). Fanfiction is never rated or
// reviewed in the app: recs belong on AO3. The database refuses both for fics (ratings/reviews RLS).
import { supabase } from './supabase';

export type Review = {
  id: string;
  body: string;
  contains_spoilers: boolean;
  created_at: string;
  author: { id: string; username: string };
};

async function me() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Not signed in.');
  return data.user.id;
}

export async function rateBook(storyId: string, rating: number) {
  if (rating < 0.5 || rating > 5 || rating * 2 !== Math.floor(rating * 2)) {
    throw new Error('Ratings go from 0.5 to 5 in half stars.');
  }
  const { error } = await supabase
    .from('ratings')
    .upsert({ story_id: storyId, rating, updated_at: new Date().toISOString() }, { onConflict: 'user_id,story_id' });
  if (error) throw error;
}

export async function myRating(storyId: string): Promise<number | null> {
  const { data, error } = await supabase.from('ratings').select('rating').eq('story_id', storyId).eq('user_id', await me()).maybeSingle();
  if (error) throw error;
  return data ? Number(data.rating) : null;
}

export async function bookStats(storyId: string): Promise<{ average: number; count: number } | null> {
  const { data, error } = await supabase.from('book_rating_stats').select('average_rating, ratings_count').eq('story_id', storyId).maybeSingle();
  if (error) throw error;
  return data ? { average: Number(data.average_rating), count: Number(data.ratings_count) } : null;
}

const REVIEW = 'id, body, contains_spoilers, created_at, author:profiles!reviews_user_id_fkey (id, username)';

/** Reviews of a book, newest first (hidden ones and those by people you blocked are left out by RLS). */
export async function loadReviews(storyId: string): Promise<Review[]> {
  const { data, error } = await supabase.from('reviews').select(REVIEW).eq('story_id', storyId).order('created_at', { ascending: false });
  if (error) throw error;
  return data as unknown as Review[];
}

export async function myReview(storyId: string): Promise<Review | null> {
  const { data, error } = await supabase.from('reviews').select(REVIEW).eq('story_id', storyId).eq('user_id', await me()).maybeSingle();
  if (error) throw error;
  return data as unknown as Review | null;
}

/** One review per reader and book: saving again edits it. */
export async function saveReview(storyId: string, body: string, containsSpoilers: boolean) {
  if (!body.trim()) throw new Error('The review is empty.');
  const { error } = await supabase
    .from('reviews')
    .upsert(
      { story_id: storyId, body: body.trim(), contains_spoilers: containsSpoilers, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,story_id' },
    );
  if (error) throw error;
}

export async function deleteReview(storyId: string) {
  const { error } = await supabase.from('reviews').delete().eq('story_id', storyId).eq('user_id', await me());
  if (error) throw error;
}
