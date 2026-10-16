import { block } from '../safety';
import { bookStats, deleteReview, loadReviews, myRating, myReview, rateBook, saveReview } from '../reviews';
import { addToLibrary, createManualBook } from '../stories';
import { supabase } from '../supabase';

// Book ratings (half stars) and reviews with a spoiler flag (docs/DECISIONS.md: Fandom etiquette;
// Finishing a fic: no ratings, no recs). Real readers on local Supabase.
const password = 'test-password-1234';
const run = Date.now().toString(36);
type User = { email: string; id: string; username: string };

async function signUp(name: string): Promise<User> {
  const email = `${name}-${run}@example.test`;
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data.user) throw error ?? new Error(`could not sign up ${email}`);
  const username = `${name}_${run}`;
  await supabase.from('profiles').insert({ id: data.user.id, username }).throwOnError();
  await supabase.auth.signOut();
  return { email, id: data.user.id, username };
}

async function as(u: User) {
  await supabase.auth.signOut();
  const { error } = await supabase.auth.signInWithPassword({ email: u.email, password });
  if (error) throw error;
}

let a: User;
let b: User;
let bookId: string;

beforeAll(async () => {
  a = await signUp('rater');
  b = await signUp('critic');
  await as(a);
  bookId = (await createManualBook({ title: 'Rated', author: 'x', chapters: 2, language: 'en' })).id;
  await addToLibrary(bookId, 'finished');
});

afterAll(async () => {
  await supabase.auth.signOut();
});

it('half-star ratings; rating again replaces yours; everyone sees the average', async () => {
  await as(a);
  await rateBook(bookId, 4);
  await rateBook(bookId, 4.5);
  expect(await myRating(bookId)).toBe(4.5);
  await as(b);
  await rateBook(bookId, 3.5);
  expect(await bookStats(bookId)).toEqual({ average: 4, count: 2 });
  await expect(rateBook(bookId, 3.3)).rejects.toThrow('half');
});

it('reviews: one per reader, edited in place, spoiler flag kept, newest first', async () => {
  await as(a);
  await saveReview(bookId, 'Lovely book', false);
  await saveReview(bookId, 'Lovely book, the ending made me cry', true);
  expect(await myReview(bookId)).toMatchObject({ body: 'Lovely book, the ending made me cry', contains_spoilers: true });
  await as(b);
  await saveReview(bookId, 'Not for me', false);
  const reviews = await loadReviews(bookId);
  expect(reviews.map((r) => [r.author.username, r.contains_spoilers])).toEqual([
    [b.username, false],
    [a.username, true],
  ]);
});

it('reviews by people you blocked are not shown', async () => {
  await as(b);
  await block(a.id);
  expect((await loadReviews(bookId)).map((r) => r.author.username)).toEqual([b.username]);
});

it('an empty review is refused; you can delete yours', async () => {
  await as(b);
  await expect(saveReview(bookId, '  ', false)).rejects.toThrow('empty');
  await deleteReview(bookId);
  expect(await myReview(bookId)).toBeNull();
});
