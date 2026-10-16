import { myCoverUrl, removeCover, uploadCover } from '../covers';
import { addToLibrary, createManualBook } from '../stories';
import { supabase } from '../supabase';

// Private custom covers in Supabase Storage (docs/DECISIONS.md, "Custom covers"): only you ever
// see your cover. Real readers and real storage on local Supabase.
const password = 'test-password-1234';
const run = Date.now().toString(36);
type User = { email: string; id: string };

async function signUp(name: string): Promise<User> {
  const email = `${name}-${run}@example.test`;
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data.user) throw error ?? new Error(`could not sign up ${email}`);
  await supabase.from('profiles').insert({ id: data.user.id, username: `${name}_${run}` }).throwOnError();
  await supabase.auth.signOut();
  return { email, id: data.user.id };
}

async function as(u: User) {
  await supabase.auth.signOut();
  const { error } = await supabase.auth.signInWithPassword({ email: u.email, password });
  if (error) throw error;
}

// A 1×1 PNG.
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (ch) => ch.charCodeAt(0));

let owner: User;
let other: User;
let storyId: string;
let path: string;

beforeAll(async () => {
  owner = await signUp('coverowner');
  other = await signUp('coverother');
  await as(owner);
  storyId = (await createManualBook({ title: 'My Cover', author: 'x', chapters: 2, language: 'en' })).id;
  await addToLibrary(storyId, 'currently_reading');
  await as(other);
  await addToLibrary(storyId, 'want_to_read');
});

afterAll(async () => {
  await supabase.auth.signOut();
});

it('you upload a cover and see it', async () => {
  await as(owner);
  path = await uploadCover(storyId, PNG.buffer, 'image/png');
  expect(path.startsWith(`${owner.id}/`)).toBe(true);
  const url = await myCoverUrl(storyId);
  expect(url).not.toBeNull();
  expect((await fetch(url!)).status).toBe(200);
});

it('nobody else can see it, list it or overwrite it', async () => {
  await as(other);
  expect(await myCoverUrl(storyId)).toBeNull();
  const { data: downloaded } = await supabase.storage.from('covers').download(path);
  expect(downloaded).toBeNull();
  const { data: listed } = await supabase.storage.from('covers').list(owner.id);
  expect(listed ?? []).toEqual([]);
  const { error } = await supabase.storage.from('covers').upload(path, PNG.buffer, { contentType: 'image/png', upsert: true });
  expect(error).not.toBeNull();
});

it('only images', async () => {
  await as(owner);
  await expect(uploadCover(storyId, new TextEncoder().encode('<script>').buffer, 'text/html')).rejects.toThrow('image');
});

it('replacing a cover removes the old file; removing it goes back to the usual cover', async () => {
  await as(owner);
  const second = await uploadCover(storyId, PNG.buffer, 'image/png');
  expect(second).not.toBe(path);
  const { data: old } = await supabase.storage.from('covers').download(path);
  expect(old).toBeNull();
  await removeCover(storyId);
  expect(await myCoverUrl(storyId)).toBeNull();
  const { data: gone } = await supabase.storage.from('covers').download(second);
  expect(gone).toBeNull();
});
