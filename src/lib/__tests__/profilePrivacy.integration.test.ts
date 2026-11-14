import { setAdmin } from '../../../test/database';
import { TERMS_VERSION } from '../legal';
import { addToLibrary, createManualBook } from '../stories';
import { supabase } from '../supabase';

// Other readers see only the public part of a profile (docs/legal/privacy-policy.md, "Profile"); the
// admin flag and the terms acceptance stay with the owner, who loads them through my_profile(). Library
// entries are only ever private. Real readers on local Supabase.
const password = 'test-password-1234';
const run = Date.now().toString(36);
type User = { email: string; id: string; username: string };

async function signUp(name: string): Promise<User> {
  const email = `${name}-${run}@example.test`;
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data.user) throw error ?? new Error(`could not sign up ${email}`);
  const username = `${name}_${run}`;
  await supabase
    .from('profiles')
    .insert({ id: data.user.id, username, terms_version: TERMS_VERSION, age_confirmed: true })
    .throwOnError();
  await supabase.auth.signOut();
  return { email, id: data.user.id, username };
}

async function as(u: User) {
  await supabase.auth.signOut();
  const { error } = await supabase.auth.signInWithPassword({ email: u.email, password });
  if (error) throw error;
}

let admin: User;
let reader: User;

beforeAll(async () => {
  admin = await signUp('privadmin');
  reader = await signUp('privreader');
  setAdmin(admin.id, true);
});

afterAll(async () => {
  await supabase.auth.signOut();
});

it('another reader reads the public profile columns', async () => {
  await as(reader);
  const { data } = await supabase
    .from('profiles')
    .select('id, username, display_name, reads_books, reads_fanfic, favourite_genres, favourite_fandoms, created_at')
    .eq('id', admin.id)
    .single()
    .throwOnError();
  expect(data).toMatchObject({ id: admin.id, username: admin.username, reads_books: true });
});

it.each(['is_admin', 'is_suspended', 'terms_version', 'terms_accepted_at', 'age_confirmed', '*'])(
  'another reader cannot read %s of a profile',
  async (column) => {
    await as(reader);
    const { data, error } = await supabase.from('profiles').select(column).eq('id', admin.id);
    expect(data).toBeNull();
    expect(error?.code).toBe('42501');
  },
);

it('the admin list cannot be read by filtering on the flag either', async () => {
  await as(reader);
  const { error } = await supabase.from('profiles').select('id').eq('is_admin', true);
  expect(error?.code).toBe('42501');
});

it('a reader loads her whole own profile through my_profile()', async () => {
  await as(admin);
  const { data } = await supabase.rpc('my_profile').select('id, is_admin, terms_version, age_confirmed').maybeSingle().throwOnError();
  expect(data).toEqual({ id: admin.id, is_admin: true, terms_version: TERMS_VERSION, age_confirmed: true });
  await as(reader);
  const mine = await supabase.rpc('my_profile').select('id, is_admin').throwOnError();
  expect(mine.data).toEqual([{ id: reader.id, is_admin: false }]);
});

it('an update of her own profile cannot return a hidden column', async () => {
  await as(admin);
  const hidden = await supabase.from('profiles').update({ reads_books: true }).eq('id', admin.id).select('is_admin');
  expect(hidden.data).toBeNull();
  expect(hidden.error?.code).toBe('42501');
  const visible = await supabase.from('profiles').update({ reads_books: true }).eq('id', admin.id).select('username').throwOnError();
  expect(visible.data).toEqual([{ username: admin.username }]);
});

it('a library entry cannot be made public, and other readers never read it', async () => {
  await as(admin);
  const storyId = (await createManualBook({ title: `Private ${run}`, author: 'x', chapters: 2, language: 'en' })).id;
  await addToLibrary(storyId, 'currently_reading');
  const { error } = await supabase.from('library_entries').update({ visibility: 'public' }).eq('story_id', storyId);
  expect(error?.code).toBe('23514');
  await as(reader);
  const { data } = await supabase.from('library_entries').select('story_id').eq('user_id', admin.id).throwOnError();
  expect(data).toEqual([]);
});
