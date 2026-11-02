// Private custom covers (docs/DECISIONS.md, "Custom covers"): a reader's own image for a story in
// their library, which only they ever see. Files live in the private "covers" bucket under a folder
// named after the reader; storage and custom_covers policies keep everyone else out.
import { supabase } from './supabase';

const BUCKET = 'covers';
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const SIGNED_URL_SECONDS = 60 * 60;
// Signed links are remembered per file and handed out again until shortly before they run out: the
// lists reload on every focus, and a newly signed link (a new URL) makes the image load all over again.
const RENEW_BEFORE_MS = 5 * 60 * 1000;
const links = new Map<string, { url: string; until: number }>();

function rememberedLink(path: string): string | undefined {
  const link = links.get(path);
  if (link && link.until > Date.now()) return link.url;
  links.delete(path);
  return undefined;
}

function rememberLink(path: string, url: string) {
  links.set(path, { url, until: Date.now() + SIGNED_URL_SECONDS * 1000 - RENEW_BEFORE_MS });
}

/** Forgets a link whose image failed to load (offline, say), so the next look signs a new one and tries again. */
export function forgetCoverLink(url: string) {
  for (const [path, link] of links) if (link.url === url) links.delete(path);
}

/** Forgets every remembered cover link (on sign-out: they belong to the reader who signed them). */
export function forgetCoverLinks() {
  links.clear();
}

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
  if (previous) {
    links.delete(previous);
    // The new cover is in place; if the old file can't be removed now it is only unused storage.
    const { error: removeError } = await supabase.storage.from(BUCKET).remove([previous]);
    if (removeError) console.warn('Could not remove the previous cover file', removeError.message);
  }
  return path;
}

/** A short-lived link to your cover for a story, or null if you haven't set one. */
export async function myCoverUrl(storyId: string): Promise<string | null> {
  const path = await currentPath(storyId);
  if (!path) return null;
  const known = rememberedLink(path);
  if (known) return known;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) throw error;
  rememberLink(path, data.signedUrl);
  return data.signedUrl;
}

/**
 * Short-lived links to your covers for many stories at once (library rows), keyed by story id; stories
 * without one are left out. One query and at most one signing request, however many rows there are.
 */
export async function myCoverUrls(storyIds: string[]): Promise<Record<string, string>> {
  if (!storyIds.length) return {};
  // All your covers (row-level security keeps it to yours), then the ones these rows want: a whole
  // library's worth of ids in the query itself would not fit in the request URL.
  const { data, error } = await supabase.from('custom_covers').select('story_id, path');
  if (error) throw error;
  const wanted = new Set(storyIds);
  const covers = data.filter((c) => wanted.has(c.story_id));
  const urls: Record<string, string> = {};
  const toSign: string[] = [];
  for (const c of covers) {
    const known = rememberedLink(c.path);
    if (known) urls[c.story_id] = known;
    else toSign.push(c.path);
  }
  if (!toSign.length) return urls;
  const { data: signed, error: signError } = await supabase.storage.from(BUCKET).createSignedUrls(toSign, SIGNED_URL_SECONDS);
  if (signError) throw signError;
  const storyOf = new Map(covers.map((c) => [c.path, c.story_id]));
  for (const link of signed) {
    // A file that can't be signed (gone from storage) just means the usual cover for that row.
    const storyId = link.path ? storyOf.get(link.path) : undefined;
    if (storyId && link.path && !link.error && link.signedUrl) {
      rememberLink(link.path, link.signedUrl);
      urls[storyId] = link.signedUrl;
    }
  }
  return urls;
}

/** Back to the usual cover (typographic, or Open Library's for books). */
export async function removeCover(storyId: string) {
  const path = await currentPath(storyId);
  if (!path) return;
  // The file first: if that fails nothing changed and the reader can try again.
  const { error: removeError } = await supabase.storage.from(BUCKET).remove([path]);
  if (removeError) throw removeError;
  links.delete(path);
  const { error } = await supabase.from('custom_covers').delete().eq('story_id', storyId);
  if (error) throw error;
}
