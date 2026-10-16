import { openRoom, postComment, toggleReaction } from '../discussions';
import { continueReadingHints, markAllRead, myNotifications, repliesToYou, roomPath } from '../notifications';
import { addToLibrary, createManualBook } from '../stories';
import { supabase } from '../supabase';

// Real readers on local Supabase.
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

let me: User;
let friend: User;
let storyId: string;

beforeAll(async () => {
  me = await signUp('noti');
  friend = await signUp('pal');
  await as(friend);
  storyId = (await createManualBook({ title: 'Noti Book', author: 'x', chapters: 3, language: 'en' })).id;
  await addToLibrary(storyId, 'finished');
  await as(me);
  await addToLibrary(storyId, 'currently_reading');
  await supabase.from('library_entries').update({ progress_section: 2 }).eq('story_id', storyId).eq('user_id', me.id).throwOnError();
  const ch2 = (await openRoom(storyId, 'chapter', 2)).id;
  const mine = await postComment(ch2, 'My take on chapter 2');
  await as(friend);
  await postComment(ch2, 'Great take!', mine.id);
  await postComment(ch2, `I agree with @${me.username.toUpperCase()}`);
  await toggleReaction(mine.id, '❤️', false);
});

afterAll(async () => {
  await supabase.auth.signOut();
});

it('replies to you: replies and mentions, newest first, no comment text', async () => {
  await as(me);
  const replies = await repliesToYou();
  expect(replies.map((n) => [n.type, n.actor_username, n.story_title, n.section_number])).toEqual([
    ['mention', friend.username, 'Noti Book', 2],
    ['reply', friend.username, 'Noti Book', 2],
  ]);
  expect(Object.keys(replies[0])).not.toContain('body');
  expect(roomPath(replies[0])).toBe(`/room/${storyId}/2`);
  expect((await myNotifications()).map((n) => n.type)).toContain('reaction');
});

it('marking all read', async () => {
  await as(me);
  await markAllRead();
  expect((await myNotifications()).every((n) => n.read_at !== null)).toBe(true);
});

it('new comments in your latest chapter since you last read it', async () => {
  await as(me);
  expect((await continueReadingHints()).get(storyId)).toEqual({ story_id: storyId, section_number: 2, new_comments: 2 });
});
