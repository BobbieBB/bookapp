import type { BookResult } from '../sources';
import { addToLibrary, createBook, createFic, findStory, type FicForm } from '../stories';
import { supabase } from '../supabase';

// Real users in the local Supabase stack; e-mail confirmation is off there (supabase/config.toml).
const password = 'test-password-1234';
const run = Date.now().toString(36);

async function signUp(name: string) {
  const email = `${name}-${run}@example.test`;
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data.user) throw error ?? new Error(`could not sign up ${email}`);
  const { error: profileError } = await supabase.from('profiles').insert({ id: data.user.id, username: `${name}_${run}` });
  if (profileError) throw profileError;
  await supabase.auth.signOut();
  return email;
}

async function signIn(email: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

const book: BookResult = {
  key: `/works/OL${run}W`,
  title: 'The Hobbit',
  author: 'J. R. R. Tolkien',
  year: 1937,
  pages: 310,
  coverUrl: null,
};

const fic = (): FicForm => ({
  ao3Link: `https://archiveofourown.org/works/${parseInt(run, 36) % 1_000_000_000}`,
  title: 'A fic',
  author: 'someone',
  fandom: 'Some Fandom',
  ship: '',
  complete: false,
  chapters: 3,
  rating: 'Teen And Up Audiences',
  warnings: ['No Archive Warnings Apply'],
});

let alice: string;
let bob: string;

beforeAll(async () => {
  alice = await signUp('alice');
  bob = await signUp('bob');
});

afterEach(async () => {
  await supabase.auth.signOut();
});

describe('books: one story per Open Library work and edition language', () => {
  it('keeps English and Bulgarian editions in separate rooms', async () => {
    await signIn(alice);
    const en = await createBook(book, { chapters: 19 }, 'en');
    const bg = await createBook(book, { chapters: 19 }, 'bg');
    expect(en.id).not.toBe(bg.id);
    expect(await findStory({ openLibraryKey: book.key, language: 'bg' })).toMatchObject({ id: bg.id });
  });

  it('joins the existing story when another reader adds the same edition', async () => {
    await signIn(bob);
    const existing = await findStory({ openLibraryKey: book.key, language: 'en' });
    const again = await createBook(book, { chapters: 19 }, 'en');
    expect(again.id).toBe(existing?.id);
  });
});

describe('fics: one story per AO3 work', () => {
  it('a second reader adding the same AO3 link joins the same story', async () => {
    await signIn(alice);
    const first = await createFic(fic());
    await addToLibrary(first.id, 'currently_reading');
    await supabase.auth.signOut();

    await signIn(bob);
    expect(await findStory({ ao3Link: fic().ao3Link })).toMatchObject({ id: first.id });
    const second = await createFic(fic());
    expect(second.id).toBe(first.id);
    await addToLibrary(second.id, 'want_to_read');
    const { data: me } = await supabase.auth.getUser();
    const { data } = await supabase
      .from('library_entries')
      .select('status')
      .eq('story_id', first.id)
      .eq('user_id', me.user!.id)
      .single();
    expect(data?.status).toBe('want_to_read');
  });
});
