import { finishChapter, loadStoryPage, markComplete, nextChapter, reopen, setChapter, setPage } from '../story';
import { addToLibrary, createFic, createManualBook } from '../stories';
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
  return { email, id: data.user.id };
}

async function signIn(u: { email: string }) {
  const { error } = await supabase.auth.signInWithPassword({ email: u.email, password });
  if (error) throw error;
}

const canAccess = async (storyId: string, section: number) => {
  const { data, error } = await supabase.rpc('can_access_section', { p_story: storyId, p_kind: 'chapter', p_section: section });
  if (error) throw error;
  return data as boolean;
};

let alice: { email: string; id: string };
let bob: { email: string; id: string };
let ficId: string;

beforeAll(async () => {
  alice = await signUp('alice');
  bob = await signUp('bob');
  await signIn(alice);
  const fic = await createFic({
    ao3Link: `https://archiveofourown.org/works/${(parseInt(run, 36) % 1_000_000_000) + 7}`,
    title: 'A WIP',
    author: 'someone',
    fandom: 'Fandom',
    ship: '',
    complete: false,
    chapters: 2,
    rating: 'Not Rated',
    warnings: [],
  });
  ficId = fic.id;
  await addToLibrary(ficId, 'currently_reading');
  await supabase.auth.signOut();
});

afterEach(async () => {
  await supabase.auth.signOut();
});

it('finishing chapters unlocks their discussions, and a caught-up reader reports a new chapter', async () => {
  await signIn(alice);
  await finishChapter(ficId, alice.id, { chapter: 1, newlyPublished: false });
  await finishChapter(ficId, alice.id, { chapter: 2, newlyPublished: false });
  expect(await canAccess(ficId, 2)).toBe(true);

  const page = await loadStoryPage(ficId, alice.id);
  const next = nextChapter(page.story, page.entry!.progress_section);
  expect(next).toEqual({ chapter: 3, newlyPublished: true });
  await finishChapter(ficId, alice.id, next!);

  const after = await loadStoryPage(ficId, alice.id);
  expect(after.story.published_sections).toBe(3);
  expect(after.entry?.progress_section).toBe(3);
});

it('moving progress back locks the later chapters again', async () => {
  await signIn(alice);
  await setChapter(ficId, alice.id, 1);
  expect(await canAccess(ficId, 2)).toBe(false);
  await setChapter(ficId, alice.id, 3);
});

it('a reader who is behind cannot report chapters far ahead', async () => {
  await signIn(bob);
  await addToLibrary(ficId, 'currently_reading');
  await expect(finishChapter(ficId, bob.id, { chapter: 9, newlyPublished: true })).rejects.toMatchObject({
    message: expect.stringMatching(/cannot update chapters/),
  });
  await expect(markComplete(ficId)).rejects.toMatchObject({ message: expect.stringMatching(/cannot complete/) });
});

it('a caught-up reader can mark the fic complete and undo it', async () => {
  await signIn(alice);
  await markComplete(ficId);
  expect((await loadStoryPage(ficId, alice.id)).story).toMatchObject({ status: 'completed', total_sections: 3 });
  await reopen(ficId);
  expect((await loadStoryPage(ficId, alice.id)).story).toMatchObject({ status: 'ongoing', total_sections: null });
});

it('a page number is personal and unlocks nothing', async () => {
  await signIn(alice);
  const book = await createManualBook({ title: 'Paged', author: 'x', chapters: 10, language: 'en' });
  await addToLibrary(book.id, 'currently_reading');
  await setPage(book.id, alice.id, 143);
  const page = await loadStoryPage(book.id, alice.id);
  expect(page.entry).toMatchObject({ progress_page: 143, progress_section: 0 });
  expect(await canAccess(book.id, 1)).toBe(false);
});

it('saving progress for a story not in your library fails instead of doing nothing', async () => {
  await signIn(bob);
  const book = await createManualBook({ title: 'Not mine', author: 'x', chapters: 3, language: 'en' });
  await expect(setChapter(book.id, bob.id, 1)).rejects.toThrow('not in your library');
});
