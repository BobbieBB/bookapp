import { forgetCoverLinks, myCoverUrl, myCoverUrls, removeCover, uploadCover } from '../covers';
import { addToLibrary, createManualBook } from '../stories';
import { sql } from '../../../test/database';
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

it('the bucket itself refuses non-images, stray names and stories you do not have', async () => {
  await as(owner);
  const html = new TextEncoder().encode('<script>alert(1)</script>').buffer;
  const direct = (name: string, body: ArrayBuffer, contentType: string) =>
    supabase.storage.from('covers').upload(`${owner.id}/${name}`, body, { contentType });
  expect((await direct(`${storyId}-x.html`, html, 'text/html')).error).not.toBeNull();
  expect((await direct(`${storyId}-x.svg`, html, 'image/svg+xml')).error).not.toBeNull();
  expect((await direct('anything.png', PNG.buffer, 'image/png')).error).not.toBeNull();
  const notMine = (await createManualBook({ title: 'Not in my library', author: 'x', chapters: 1, language: 'en' })).id;
  expect((await direct(`${notMine}-x.png`, PNG.buffer, 'image/png')).error).not.toBeNull();
});

it('covers are never public, and nobody else can delete yours', async () => {
  await as(owner);
  const { data } = supabase.storage.from('covers').getPublicUrl(path);
  expect((await fetch(data.publicUrl)).status).not.toBe(200);
  await as(other);
  await supabase.storage.from('covers').remove([path]);
  await as(owner);
  const { data: still } = await supabase.storage.from('covers').download(path);
  expect(still).not.toBeNull();
});

it('your covers for many stories at once, in one go', async () => {
  await as(owner);
  const plain = (await createManualBook({ title: 'No Cover', author: 'x', chapters: 1, language: 'en' })).id;
  await addToLibrary(plain, 'want_to_read');
  const urls = await myCoverUrls([storyId, plain]);
  expect(Object.keys(urls)).toEqual([storyId]);
  expect((await fetch(urls[storyId])).status).toBe(200);
  expect(await myCoverUrls([])).toEqual({});
  await as(other);
  expect(await myCoverUrls([storyId])).toEqual({}); // never someone else's
});

it('a whole library of rows at once, however long', async () => {
  await as(owner);
  // Far more ids than fit in one request URL; the rows without a cover of yours are simply left out.
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  const uuid = () => 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, hex);
  const ids = [...Array.from({ length: 1000 }, uuid), storyId];
  const urls = await myCoverUrls(ids);
  expect(Object.keys(urls)).toEqual([storyId]);
  expect((await fetch(urls[storyId])).status).toBe(200);
});

it('more covers than the API returns in one go (1000 rows) all come back', async () => {
  // A reader with 1100 covers, set up in SQL: stories, library entries, and a file record for each
  // (signing only needs Storage to know the file, not its bytes).
  const many = await signUp('covermany');
  const rows = sql(`
    with s as (
      insert into public.stories (kind, title, author_name, language)
      select 'book', 'Many ' || i, 'x', 'en' from generate_series(1, 1100) i returning id
    ), e as (
      insert into public.library_entries (user_id, story_id, status)
      select '${many.id}', id, 'want_to_read' from s returning story_id
    ), o as (
      insert into storage.objects (bucket_id, name, owner, metadata)
      select 'covers', '${many.id}/' || story_id || '-x.png', '${many.id}', '{"mimetype": "image/png"}'::jsonb from e
      returning name
    )
    insert into public.custom_covers (user_id, story_id, path)
    select '${many.id}', split_part(split_part(name, '/', 2), '-x.png', 1)::uuid, name from o returning story_id;
  `);
  const ids = rows.split('\n').filter((line) => /^[0-9a-f-]{36}$/.test(line));
  expect(ids).toHaveLength(1100);
  await as(many);
  const urls = await myCoverUrls(ids);
  expect(Object.keys(urls)).toHaveLength(1100);
});

it('the same link again while it is still good, not a new one on every look', async () => {
  await as(owner);
  const first = await myCoverUrl(storyId);
  const firstMany = (await myCoverUrls([storyId]))[storyId];
  await new Promise((resolve) => setTimeout(resolve, 1100)); // a new signature would carry a later time
  expect(await myCoverUrl(storyId)).toBe(first);
  expect((await myCoverUrls([storyId]))[storyId]).toBe(firstMany);
  expect(firstMany).toBe(first);
  forgetCoverLinks(); // on sign-out
  expect(await myCoverUrl(storyId)).not.toBe(first);
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
  expect(await myCoverUrl(storyId)).toContain(second); // the new cover, not the remembered link
  await removeCover(storyId);
  expect(await myCoverUrl(storyId)).toBeNull();
  const { data: gone } = await supabase.storage.from('covers').download(second);
  expect(gone).toBeNull();
});
