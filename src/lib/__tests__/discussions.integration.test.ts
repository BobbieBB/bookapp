import { createClient } from '@supabase/supabase-js';

import {
  deleteComment,
  loadComments,
  loadRooms,
  markRead,
  openRoom,
  postComment,
  subscribeToRoom,
  toggleReaction,
} from '../discussions';
import { SUPABASE_KEY, SUPABASE_URL } from '../config';
import { addToLibrary, createManualBook } from '../stories';
import { supabase } from '../supabase';

// Real readers in the local Supabase stack; e-mail confirmation is off there (supabase/config.toml).
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

const progress = (storyId: string, u: User, n: number) =>
  supabase.from('library_entries').update({ progress_section: n }).eq('story_id', storyId).eq('user_id', u.id).throwOnError();

let ahead: User; // finished chapter 3
let behind: User; // finished chapter 1
let storyId: string;
let ch2: string;

beforeAll(async () => {
  ahead = await signUp('ahead');
  behind = await signUp('behind');
  await as(ahead);
  storyId = (await createManualBook({ title: 'Rooms', author: 'x', chapters: 5, language: 'en' })).id;
  await addToLibrary(storyId, 'currently_reading');
  await progress(storyId, ahead, 3);
  await as(behind);
  await addToLibrary(storyId, 'currently_reading');
  await progress(storyId, behind, 1);
  await as(ahead);
  ch2 = (await openRoom(storyId, 'chapter', 2)).id;
});

afterAll(async () => {
  await supabase.removeAllChannels();
  await supabase.auth.signOut();
});

it('lists the rooms with your lock state', async () => {
  await as(behind);
  const rooms = await loadRooms(storyId);
  expect(rooms.map((r) => [r.kind, r.section_number, r.unlocked])).toEqual([
    ['chapter', 1, true],
    ['chapter', 2, false],
    ['chapter', 3, false],
    ['chapter', 4, false],
    ['chapter', 5, false],
    ['epilogue', null, false],
  ]);
});

it('a chapter you have not finished cannot be opened, even with its id', async () => {
  await as(ahead);
  await postComment(ch2, 'Chapter 2 twist!');
  await as(behind);
  await expect(openRoom(storyId, 'chapter', 2)).rejects.toMatchObject({ message: expect.stringMatching(/^locked/) });
  expect(await loadComments(ch2)).toEqual([]);
  await expect(postComment(ch2, 'sneaky')).rejects.toBeTruthy();
});

it('comments, one level of replies, and reactions', async () => {
  await as(ahead);
  const top = await postComment(ch2, 'What a chapter');
  const reply = await postComment(ch2, 'Agreed', top.id);
  await expect(postComment(ch2, 'too deep', reply.id)).rejects.toBeTruthy();

  await toggleReaction(top.id, '🔥', false);
  let comments = await loadComments(ch2);
  expect(comments.find((x) => x.id === top.id)?.reactions).toEqual([{ emoji: '🔥', count: 1, mine: true }]);
  expect(comments.find((x) => x.id === reply.id)?.parent_id).toBe(top.id);
  expect(comments.find((x) => x.id === top.id)?.author.username).toBe(`ahead_${run}`);

  await toggleReaction(top.id, '🔥', true);
  comments = await loadComments(ch2);
  expect(comments.find((x) => x.id === top.id)?.reactions).toEqual([]);
});

it('a deleted comment keeps its place but loses its text', async () => {
  await as(ahead);
  const doomed = await postComment(ch2, 'oops, wrong room');
  await deleteComment(doomed.id);
  const after = (await loadComments(ch2)).find((x) => x.id === doomed.id);
  expect(after?.deleted_at).not.toBeNull();
  expect(after?.body).not.toContain('wrong room');
});

it('opening a room marks it read', async () => {
  await as(ahead);
  await markRead(ch2);
  const { data } = await supabase.from('discussion_follows').select('last_read_at').eq('discussion_id', ch2).single().throwOnError();
  expect(Date.now() - new Date(data!.last_read_at).getTime()).toBeLessThan(60_000);
});

it('new comments arrive live in a room you unlocked', async () => {
  await as(behind);
  await progress(storyId, behind, 2);
  const seen: string[] = [];
  const unsubscribe = await subscribeToRoom(ch2, () => seen.push('change'));

  // Another reader on their own device posts.
  const other = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  await other.auth.signInWithPassword({ email: ahead.email, password });
  await other.from('comments').insert({ discussion_id: ch2, body: 'live one' }).throwOnError();
  await other.auth.signOut();

  await waitFor(() => seen.length > 0, 10_000);
  unsubscribe();
}, 20_000);

async function waitFor(cond: () => boolean, ms: number) {
  const until = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > until) throw new Error('timed out waiting for a live update');
    await new Promise((r) => setTimeout(r, 100));
  }
}
