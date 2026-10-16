// Private custom covers (docs/DECISIONS.md, "Custom covers"): a reader's own image for a story in
// their library, which only they ever see. Files live in the private "covers" bucket under a folder
// named after the reader; storage and custom_covers policies keep everyone else out.
import { supabase } from './supabase';

const BUCKET = 'covers';
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const SIGNED_URL_SECONDS = 60 * 60;

async function me() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Not signed in.');
  return data.user.id;
}

async function currentPath(storyId: string): Promise<string | null> {
  const { data, error } = await supabase.from('custom_covers').select('path').eq('story_id', storyId).maybeSingle();
  if (error) throw error;
  return data?.path ?? null;
}

/** Uploads a new cover for a story in your library and returns its storage path; the old one is removed. */
export async function uploadCover(storyId: string, bytes: ArrayBuffer, contentType: string): Promise<string> {
  const ext = TYPES[contentType];
  if (!ext) throw new Error('A cover must be a JPEG, PNG or WebP image.');
  const userId = await me();
  const previous = await currentPath(storyId);
  // A new name each time, so a cached old image is never shown for the new one.
  const path = `${userId}/${storyId}-${Date.now().toString(36)}.${ext}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType });
  if (uploadError) throw uploadError;
  const { error } = await supabase
    .from('custom_covers')
    .upsert({ story_id: storyId, path, updated_at: new Date().toISOString() }, { onConflict: 'user_id,story_id' });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]); // don't leave an orphan file behind
    throw error;
  }
  if (previous) await supabase.storage.from(BUCKET).remove([previous]);
  return path;
}

/** A short-lived link to your cover for a story, or null if you haven't set one. */
export async function myCoverUrl(storyId: string): Promise<string | null> {
  const path = await currentPath(storyId);
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}

/** Back to the usual cover (typographic, or Open Library's for books). */
export async function removeCover(storyId: string) {
  const path = await currentPath(storyId);
  if (!path) return;
  const { error } = await supabase.from('custom_covers').delete().eq('story_id', storyId);
  if (error) throw error;
  const { error: removeError } = await supabase.storage.from(BUCKET).remove([path]);
  if (removeError) throw removeError;
}
