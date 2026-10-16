import {
  addFavouriteFandom,
  favouriteFandoms,
  lively,
  myFandoms,
  removeFavouriteFandom,
  searchFandoms,
  suggestedFandoms,
} from '../discover';
import { addToLibrary, createFic } from '../stories';
import { supabase } from '../supabase';

// Real readers on local Supabase. Fandom names carry the run id so other tests' fics don't interfere.
const password = 'test-password-1234';
const run = Date.now().toString(36);
const FANDOM = `Test Fandom ${run}`;
const OTHER = `Other Fandom ${run}`;
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

let n = 0;
const fic = (title: string, fandom: string) =>
  createFic({
    ao3Link: `https://archiveofourown.org/works/${(parseInt(run, 36) % 1_000_000_000) + 100 + n++}`,
    title,
    author: 'w',
    fandom,
    ship: '',
    complete: true,
    chapters: 3,
    rating: 'Not Rated',
    warnings: [],
  });

let reader: User;
let writer: User;

beforeAll(async () => {
  reader = await signUp('discoverer');
  writer = await signUp('lister');
  await as(writer);
  const a = await fic('Read by many', FANDOM);
  await addToLibrary(a.id, 'finished');
  await fic('Read by none', FANDOM);
  await as(reader);
  const mine = await fic('Mine', OTHER);
  await addToLibrary(mine.id, 'currently_reading');
});

afterAll(async () => {
  await supabase.auth.signOut();
});

it('your fandoms: picked first, then from your library; others in your library are suggested', async () => {
  await as(reader);
  expect((await myFandoms()).map((f) => f.fandom)).toContain(OTHER);
  expect(await suggestedFandoms()).toContain(OTHER);
  await addFavouriteFandom(FANDOM);
  await addFavouriteFandom(OTHER);
  await addFavouriteFandom(OTHER); // twice is still once
  const mine = await myFandoms();
  expect(mine.slice(0, 2).map((f) => [f.fandom, f.source])).toEqual([
    [FANDOM, 'picked'],
    [OTHER, 'picked'],
  ]);
  expect(await suggestedFandoms()).not.toContain(OTHER);
  await removeFavouriteFandom(FANDOM);
  expect((await myFandoms()).map((f) => f.fandom)).not.toContain(FANDOM);
});

it('two fandoms added at once both stay; Profile sees every picked fandom', async () => {
  await as(reader);
  const many = Array.from({ length: 7 }, (_, i) => `Many ${i} ${run}`);
  await Promise.all(many.map((f) => addFavouriteFandom(f)));
  const favourites = await favouriteFandoms();
  for (const f of many) expect(favourites).toContain(f);
  expect((await myFandoms()).length).toBeLessThanOrEqual(6);
  await Promise.all(many.map((f) => removeFavouriteFandom(f)));
});

it('searches all fandoms in the app', async () => {
  await as(reader);
  expect((await searchFandoms(`test fandom ${run}`)).map((f) => f.fandom)).toEqual([FANDOM]);
});

it('Lively in your fandoms: stories you do not read yet, most read first when nobody talks', async () => {
  await as(reader);
  const stories = await lively([FANDOM]);
  expect(stories.map((s) => s.title)).toEqual(['Read by many']);
  expect(stories[0].tier).toBe('readers');
});
