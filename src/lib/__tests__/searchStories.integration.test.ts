import { serviceClient } from '../../../test/service';
import { recordRequests } from '../../../test/network';
import { searchStories } from '../discover';
import { addToLibrary, createFic, createManualBook } from '../stories';
import { supabase } from '../supabase';

// Search Livami by title or author (PO, 16 Nov 2026). Real readers on local Supabase; titles and authors
// carry the run id so other tests' stories don't interfere.
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

let n = 0;
const fic = (title: string, author: string, link = true) =>
  createFic({
    ao3Link: link ? `https://archiveofourown.org/works/${(parseInt(run, 36) % 1_000_000_000) + 900 + n++}` : null,
    title,
    author,
    fandom: `Search Fandom ${run}`,
    ship: '',
    complete: true,
    chapters: 2,
    rating: 'Not Rated',
    warnings: [],
  });

let reader: User;
let other: User;
let popularId: string;
let quietId: string;
let bookId: string;
let unlinkedId: string;
let hiddenId: string;

beforeAll(async () => {
  reader = await signUp('searcher');
  other = await signUp('searched');
  await as(other);
  // Two titles that both contain the text: the one more readers have comes first.
  const quiet = await fic(`Quiet Wings ${run}`, 'nobody');
  quietId = quiet.id;
  const popular = await fic(`Loud Wings ${run}`, 'somebody');
  popularId = popular.id;
  await addToLibrary(popular.id, 'currently_reading');
  bookId = (await createManualBook({ title: `Paper Wings ${run}`, author: 'A. Writer', chapters: 10, language: 'bg' })).id;
  unlinkedId = (await fic(`No Link Wings ${run}`, 'offline', false)).id;
  hiddenId = (await fic(`Hidden Wings ${run}`, 'gone')).id;
  await fic('Something else entirely', `Penname ${run}`);
  // An author's opt-out: hidden stories never show anywhere.
  await serviceClient().from('stories').update({ is_hidden: true }).eq('id', hiddenId).throwOnError();
});

afterAll(async () => {
  await supabase.auth.signOut();
});

it('finds books and fics by title, the most read first; hidden stories never show', async () => {
  await as(reader);
  const hits = await searchStories(`wings ${run}`);
  const ids = hits.map((h) => h.id);
  expect(ids).toEqual(expect.arrayContaining([popularId, quietId, bookId, unlinkedId]));
  expect(ids).not.toContain(hiddenId);
  expect(ids.indexOf(popularId)).toBeLessThan(ids.indexOf(quietId));
  const book = hits.find((h) => h.id === bookId);
  expect(book).toMatchObject({ kind: 'book', author_name: 'A. Writer', language: 'bg' });
  expect(hits.find((h) => h.id === popularId)).toMatchObject({ kind: 'fanfic', readers: 1, fandoms: [`Search Fandom ${run}`] });
});

it('a title that starts with the text comes before one that only contains it', async () => {
  await as(reader);
  const hits = await searchStories(`paper wings ${run}`);
  expect(hits[0].id).toBe(bookId);
});

it('finds stories by author, case does not matter', async () => {
  await as(reader);
  const hits = await searchStories(`PENNAME ${run}`);
  expect(hits.map((h) => h.title)).toEqual(['Something else entirely']);
});

it('fewer than 3 letters finds nothing', async () => {
  await as(reader);
  expect(await searchStories('wi')).toEqual([]);
  expect(await searchStories('   ')).toEqual([]);
});

it('only asks Livami: nothing goes to AO3 or Open Library', async () => {
  await as(reader);
  const outside = recordRequests((url) => url.includes('archiveofourown.org') || url.includes('openlibrary.org'));
  try {
    await searchStories(`wings ${run}`);
  } finally {
    outside.stop();
  }
  expect(outside.bodies).toEqual([]);
});
