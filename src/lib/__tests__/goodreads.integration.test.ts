import { importGoodreads, type GoodreadsBook } from '../goodreads';
import type { BookResult } from '../sources';
import { supabase } from '../supabase';

// Import from Goodreads into a real reader's library on local Supabase. Search is faked (no network), with
// invented books only.
const password = 'test-password-1234';
const run = Date.now().toString(36);

let me: string;

beforeAll(async () => {
  const email = `importer-${run}@example.test`;
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data.user) throw error ?? new Error('could not sign up');
  me = data.user.id;
  await supabase.from('profiles').insert({ id: me, username: `importer_${run}` }).throwOnError();
});

const result = (title: string, author: string): BookResult => ({
  key: `/works/OL${run}${title.length}W`,
  source: 'open_library',
  title,
  author,
  year: 2020,
  pages: 300,
  coverUrl: null,
});

it('adds matched books with their status and stars, skips ones already there, lists the rest', async () => {
  const lantern: GoodreadsBook = { title: `Lantern ${run}`, author: 'Mira Vale', isbn: null, shelf: 'read', rating: 4 };
  const wings: GoodreadsBook = { title: `Wings of Paper ${run}`, author: 'Ivo Stern', isbn: null, shelf: 'to-read', rating: null };
  const missing: GoodreadsBook = { title: `Nowhere ${run}`, author: 'No One', isbn: null, shelf: 'read', rating: 5 };
  const search = async (q: string) =>
    q.startsWith('Lantern') ? [result(lantern.title, 'Mira Vale')] : q.startsWith('Wings') ? [result(wings.title, 'Ivo Stern')] : [];
  const progress: number[] = [];

  const first = await importGoodreads(me, [lantern, wings, missing], { search, pauseMs: 0, onProgress: (done) => progress.push(done) });
  expect(first.added).toEqual([lantern, wings]);
  expect(first.notFound).toEqual([missing]);
  expect(first.failed).toEqual([]);
  expect(progress).toEqual([1, 2, 3]);

  const { data: entries } = await supabase
    .from('library_entries')
    .select('status, stories(title, total_sections)')
    .eq('user_id', me)
    .throwOnError();
  expect(entries).toHaveLength(2);
  expect(entries).toEqual(
    expect.arrayContaining([
      { status: 'want_to_read', stories: { title: wings.title, total_sections: null } },
      { status: 'finished', stories: { title: lantern.title, total_sections: null } },
    ]),
  );
  const { data: ratings } = await supabase.from('ratings').select('rating').eq('user_id', me).throwOnError();
  expect(ratings?.map((r) => Number(r.rating))).toEqual([4]);

  // Again: nothing doubles.
  const again = await importGoodreads(me, [lantern], { search, pauseMs: 0 });
  expect(again.already).toEqual([lantern]);
  expect(again.added).toEqual([]);
});

it('stops when asked, keeping what is done', async () => {
  let n = 0;
  const r = await importGoodreads(
    me,
    [1, 2, 3].map((i) => ({ title: `Stop ${i} ${run}`, author: 'A. B', isbn: null, shelf: 'to-read' as const, rating: null })),
    { search: async () => [], pauseMs: 0, shouldStop: () => n++ >= 1 },
  );
  expect(r.notFound).toHaveLength(1);
});
