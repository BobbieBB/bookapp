import { livamiChapterCount } from '../chapterSuggestions';
import { createBook, createManualBook } from '../stories';
import { supabase } from '../supabase';

// Other Livami readers' counts, on local Supabase. Invented books only.
const run = Date.now().toString(36);

beforeAll(async () => {
  const email = `counter-${run}@example.test`;
  const { data, error } = await supabase.auth.signUp({ email, password: 'test-password-1234' });
  if (error || !data.user) throw error ?? new Error('could not sign up');
  await supabase.from('profiles').insert({ id: data.user.id, username: `counter_${run}` }).throwOnError();
});

it('suggests the count set on the same work in another language, or on the same title and author', async () => {
  const work = `/works/OL${run}W`;
  await createBook({ key: work, source: 'open_library', title: `Lantern ${run}`, author: 'Mira Vale', year: 2020, pages: 300, coverUrl: null }, { chapters: 22 }, 'en');
  expect(await livamiChapterCount({ title: 'Something else', author: 'Nobody', olWork: work })).toBe(22);

  await createManualBook({ title: `Tide ${run}`, author: 'Ivo Stern', chapters: 31, language: 'bg' });
  expect(await livamiChapterCount({ title: `tide ${run}`, author: 'I. Stern' })).toBe(31);
  expect(await livamiChapterCount({ title: `Tide ${run}`, author: 'Someone Else' })).toBeNull();
});
