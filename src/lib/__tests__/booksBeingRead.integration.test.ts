import { serviceClient } from '../../../test/service';
import { booksBeingRead } from '../discover';
import { addToLibrary, createManualBook } from '../stories';
import { supabase } from '../supabase';

// Discover for books (decision F): "Being read now". Real readers on local Supabase; titles carry the run id.
// Other test files add books to the same database at the same time, so these checks look at this file's books
// only: which are there, and their order among themselves.
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

const book = async (title: string, language: 'en' | 'bg') => (await createManualBook({ title: `${title} ${run}`, author: 'A. Writer', chapters: 5, language })).id;

let me: User;
let ids: Record<'busyEn' | 'quietBg' | 'finishedOnly' | 'hidden' | 'mine', string>;

beforeAll(async () => {
  me = await signUp('browser');
  const readers = [await signUp('reader1'), await signUp('reader2'), await signUp('reader3')];
  await as(readers[0]);
  ids = {
    busyEn: await book('Busy English', 'en'),
    quietBg: await book('Quiet Bulgarian', 'bg'),
    finishedOnly: await book('Read Before', 'en'),
    hidden: await book('Taken Down', 'en'),
    mine: await book('Already Mine', 'en'),
  };
  for (const r of readers) {
    await as(r);
    await addToLibrary(ids.busyEn, 'currently_reading');
    await addToLibrary(ids.finishedOnly, 'finished');
    await addToLibrary(ids.hidden, 'currently_reading');
    await addToLibrary(ids.mine, 'currently_reading');
  }
  await as(readers[0]);
  await addToLibrary(ids.quietBg, 'currently_reading');
  await serviceClient().from('stories').update({ is_hidden: true }).eq('id', ids.hidden).throwOnError();
  await as(me);
  await addToLibrary(ids.mine, 'want_to_read');
});

afterAll(async () => {
  await supabase.auth.signOut();
});

const ours = (list: { id: string }[]) => list.map((b) => b.id).filter((id) => Object.values(ids).includes(id));

it('books being read now come first, the reader’s language first; never hidden ones or your own', async () => {
  await as(me);
  const bg = await booksBeingRead('bg');
  const mine = ours(bg);
  expect(mine).not.toContain(ids.hidden);
  expect(mine).not.toContain(ids.mine);
  expect(mine.slice(0, 2)).toEqual([ids.quietBg, ids.busyEn]); // one reader in Bulgarian before three in English
  const busy = bg.find((b) => b.id === ids.busyEn)!;
  expect(busy).toMatchObject({ reading: 3, readers: 3, tier: 'reading', language: 'en', author_name: 'A. Writer' });

  // In English, the more readers first.
  expect(ours(await booksBeingRead('en')).slice(0, 2)).toEqual([ids.busyEn, ids.quietBg]);
});

it('a book nobody is reading right now follows as most read, after every book being read', async () => {
  await as(me);
  const list = await booksBeingRead('en');
  const finished = list.find((b) => b.id === ids.finishedOnly);
  // The list holds 30; with many books being read in other tests at the same time, this one may be past it.
  if (list.length < 30) expect(finished).toBeDefined();
  if (finished) {
    expect(finished).toMatchObject({ reading: 0, readers: 3, tier: 'readers' });
    expect(list.slice(0, list.indexOf(finished)).every((b) => b.tier === 'reading')).toBe(true);
  }
});

it('never tells anyone who reads what: no reader ids in the answer', async () => {
  await as(me);
  const [first] = await booksBeingRead('en');
  expect(Object.keys(first).sort()).toEqual(['author_name', 'cover_url', 'id', 'language', 'rank', 'readers', 'reading', 'tier', 'title']);
});
