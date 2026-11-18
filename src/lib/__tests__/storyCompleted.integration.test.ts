import { serviceClient } from '../../../test/service';
import { markReadUpTo, myNotifications, repliesToYou } from '../notifications';
import { markComplete, reopen } from '../story';
import { addToLibrary, createFic } from '../stories';
import { supabase } from '../supabase';

// "[Fic] is complete. The Epilogue is open." (docs/DECISIONS.md, Finishing a WIP fic). Real readers on
// local Supabase; titles carry the run id so other tests' fics don't interfere.
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
async function wip(title: string) {
  return createFic({
    ao3Link: `https://archiveofourown.org/works/${(parseInt(run, 36) % 1_000_000_000) + 1300 + n++}`,
    title,
    author: 'w',
    fandom: `Done Fandom ${run}`,
    ship: '',
    complete: false,
    chapters: 2,
    rating: 'Not Rated',
    warnings: [],
  });
}

/** Adds the fic and reads every published chapter, so this reader may mark it complete. */
async function caughtUp(u: User, storyId: string) {
  await as(u);
  await addToLibrary(storyId, 'currently_reading');
  await supabase.from('library_entries').update({ progress_section: 2 }).eq('story_id', storyId).eq('user_id', u.id).throwOnError();
}

const completedNotices = async (storyId: string) =>
  (await myNotifications(200)).filter((x) => x.type === 'story_completed' && x.story_id === storyId);

let marker: User;
let waiting: User;
let stranger: User;

beforeAll(async () => {
  marker = await signUp('marker');
  waiting = await signUp('waiting');
  stranger = await signUp('stranger');
});

afterAll(async () => {
  await supabase.auth.signOut();
});

it('everyone else with the fic in their library is told; the reader who marked it is not', async () => {
  await as(marker);
  const fic = await wip(`Finally done ${run}`);
  await caughtUp(marker, fic.id);
  await as(waiting);
  await addToLibrary(fic.id, 'want_to_read');
  await as(marker);
  await markComplete(fic.id);

  await as(waiting);
  const notices = await completedNotices(fic.id);
  expect(notices.map((x) => [x.story_title, x.story_kind, x.actor_username, x.room_kind, x.comment_id])).toEqual([
    [`Finally done ${run}`, 'fanfic', null, null, null],
  ]);
  // On Home, with replies and mentions.
  expect((await repliesToYou(50)).map((x) => x.id)).toContain(notices[0].id);

  await as(marker);
  expect(await completedNotices(fic.id)).toEqual([]);
  await as(stranger); // not in their library
  expect(await completedNotices(fic.id)).toEqual([]);
});

it('undo hides the notice while the fic is ongoing again', async () => {
  await as(marker);
  const fic = await wip(`Not done after all ${run}`);
  await caughtUp(marker, fic.id);
  await as(waiting);
  await addToLibrary(fic.id, 'currently_reading');
  await as(marker);
  await markComplete(fic.id);
  await as(waiting);
  expect(await completedNotices(fic.id)).toHaveLength(1);
  await as(marker);
  await reopen(fic.id);
  await as(waiting);
  expect(await completedNotices(fic.id)).toEqual([]);
});

it('mark, undo, mark again: one notice, and one already read stays read', async () => {
  await as(marker);
  const fic = await wip(`Back and forth ${run}`);
  await caughtUp(marker, fic.id);
  await as(waiting);
  await addToLibrary(fic.id, 'currently_reading');
  await as(marker);
  await markComplete(fic.id);
  await as(waiting);
  const [first] = await completedNotices(fic.id);
  await markReadUpTo(first.created_at);
  for (let i = 0; i < 2; i++) {
    await as(marker);
    await reopen(fic.id);
    await markComplete(fic.id);
  }
  await as(waiting);
  const again = await completedNotices(fic.id);
  expect(again).toHaveLength(1);
  expect(again[0].id).toBe(first.id);
  expect(again[0].read_at).not.toBeNull();
  const { data } = await serviceClient().from('notifications').select('id').eq('story_id', fic.id);
  expect(data).toHaveLength(1);
});

it('older builds ask Home for replies and mentions only, which never include the notice', async () => {
  await as(marker);
  const fic = await wip(`Old build ${run}`);
  await caughtUp(marker, fic.id);
  await as(waiting);
  await addToLibrary(fic.id, 'currently_reading');
  await as(marker);
  await markComplete(fic.id);
  await as(waiting);
  expect((await myNotifications(200, ['reply', 'mention'])).filter((x) => x.story_id === fic.id)).toEqual([]);
});

it('a fic hidden by its author is not mentioned any more', async () => {
  await as(marker);
  const fic = await wip(`Hidden later ${run}`);
  await caughtUp(marker, fic.id);
  await as(waiting);
  await addToLibrary(fic.id, 'currently_reading');
  await as(marker);
  await markComplete(fic.id);
  await serviceClient().from('stories').update({ is_hidden: true }).eq('id', fic.id).throwOnError();
  await as(waiting);
  expect(await completedNotices(fic.id)).toEqual([]);
  const { data } = await supabase.from('notifications').select('id').eq('story_id', fic.id);
  expect(data).toEqual([]);
});

it('never pushed: pushes are for replies and mentions only', async () => {
  await as(marker);
  const fic = await wip(`Quietly done ${run}`);
  await caughtUp(marker, fic.id);
  await as(waiting);
  await addToLibrary(fic.id, 'currently_reading');
  await as(marker);
  await markComplete(fic.id);
  const { data } = await serviceClient().from('notifications').select('type, pushed_at').eq('story_id', fic.id).eq('user_id', waiting.id);
  expect(data).toEqual([{ type: 'story_completed', pushed_at: null }]);
});
