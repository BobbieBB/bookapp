import { holdRequest } from '../../../test/network';
import { deleteMyAccount } from '../account';
import * as pushDevice from '../pushDevice';
import { uploadCover } from '../covers';
import { loadComments, openRoom, postComment } from '../discussions';
import { loadReviews, saveReview } from '../reviews';
import { addToLibrary, createManualBook } from '../stories';
import { supabase } from '../supabase';

// Deleting your account (docs/DECISIONS.md, "Deleting an account: what happens to comments"):
// comments and reviews stay without an author, or are erased on request; cover files go first.
// Real readers and real storage on local Supabase.
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

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (ch) => ch.charCodeAt(0));

let reader: User; // stays, replies
let storyId: string;
let roomId: string;

beforeAll(async () => {
  reader = await signUp('stayer');
  await as(reader);
  storyId = (await createManualBook({ title: 'Leaving Book', author: 'x', chapters: 2, language: 'en' })).id;
  await addToLibrary(storyId, 'finished');
  roomId = (await openRoom(storyId, 'chapter', 1)).id;
});

afterAll(async () => {
  await supabase.auth.signOut();
});

/** A reader who finished the book, wrote a comment (which the stayer answers) and a review. */
async function leaver(name: string) {
  const u = await signUp(name);
  await as(u);
  await addToLibrary(storyId, 'finished');
  const comment = await postComment(roomId, `${name} was here`);
  await saveReview(storyId, `${name} reviews`, false);
  await as(reader);
  const reply = await postComment(roomId, `answering ${name}`, comment.id);
  await as(u);
  return { user: u, commentId: comment.id, replyId: reply.id };
}

const signInFails = async (u: User) =>
  !!(await supabase.auth.signInWithPassword({ email: u.email, password })).error;

it('by default, comments and reviews stay without an author and replies stay in their thread', async () => {
  const { user, commentId, replyId } = await leaver('keeper');
  await deleteMyAccount({ eraseComments: false });
  expect((await supabase.auth.getSession()).data.session).toBeNull();
  expect(await signInFails(user)).toBe(true);

  await as(reader);
  const comments = await loadComments(roomId);
  const kept = comments.find((c) => c.id === commentId)!;
  expect(kept).toMatchObject({ body: 'keeper was here', deleted_at: null, author: null });
  expect(comments.find((c) => c.id === replyId)).toMatchObject({ parent_id: commentId, body: 'answering keeper' });
  expect((await loadReviews(storyId)).find((r) => r.body === 'keeper reviews')).toMatchObject({ author: null });
});

it('with "also delete my comments", their text is erased but their place stays; reviews go', async () => {
  const { user, commentId, replyId } = await leaver('eraser');
  await deleteMyAccount({ eraseComments: true });
  expect(await signInFails(user)).toBe(true);

  await as(reader);
  const comments = await loadComments(roomId);
  const erased = comments.find((c) => c.id === commentId)!;
  expect(erased.deleted_at).not.toBeNull();
  expect(erased.body).toBe('[deleted]');
  expect(erased.author).toBeNull();
  expect(comments.find((c) => c.id === replyId)).toMatchObject({ parent_id: commentId });
  expect((await loadReviews(storyId)).some((r) => r.body === 'eraser reviews')).toBe(false);
});

it('removes your cover files before the account itself', async () => {
  const u = await signUp('coverleaver');
  await as(u);
  const book = (await createManualBook({ title: 'Covered', author: 'x', chapters: 2, language: 'en' })).id;
  await addToLibrary(book, 'currently_reading');
  await uploadCover(book, PNG.buffer, 'image/png');
  const files = async () => (await supabase.storage.from('covers').list(u.id)).data ?? [];
  expect(await files()).toHaveLength(1);

  const rpc = holdRequest((url) => url.includes('/rpc/delete_my_account'));
  const deleting = deleteMyAccount({ eraseComments: false });
  // The account still exists while its deletion is held back: its folder is already empty.
  await waitUntil(async () => (await files()).length === 0);
  rpc.release();
  await deleting;
  expect(await signInFails(u)).toBe(true);
});

it('still deletes the account when the cover files cannot be removed', async () => {
  const u = await signUp('offlinecovers');
  await as(u);
  const storage = jest.spyOn(supabase.storage, 'from').mockImplementation(() => {
    throw new Error('storage unreachable');
  });
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    await deleteMyAccount({ eraseComments: false });
    expect(warn).toHaveBeenCalledWith('Could not remove cover files', 'storage unreachable');
  } finally {
    storage.mockRestore();
    warn.mockRestore();
  }
  expect(await signInFails(u)).toBe(true);
});

it('when the deletion fails, you stay signed in and are told, with no cover pointing at a removed file', async () => {
  const u = await signUp('notdeleted');
  await as(u);
  const book = (await createManualBook({ title: 'Still Covered', author: 'x', chapters: 2, language: 'en' })).id;
  await addToLibrary(book, 'currently_reading');
  await uploadCover(book, PNG.buffer, 'image/png');
  const rpc = jest.spyOn(supabase, 'rpc').mockResolvedValueOnce({ data: null, error: new Error('offline') } as never);
  try {
    await expect(deleteMyAccount({ eraseComments: false })).rejects.toThrow('offline');
  } finally {
    rpc.mockRestore();
  }
  expect((await supabase.auth.getSession()).data.session?.user.id).toBe(u.id);
  expect((await supabase.storage.from('covers').list(u.id)).data).toEqual([]);
  expect((await supabase.from('custom_covers').select('story_id').throwOnError()).data).toEqual([]);
});

it('gives up on cover files that will not all go, instead of trying forever', async () => {
  const u = await signUp('stuckcovers');
  await as(u);
  // A full page every time, of which only some files are removed.
  const page = Array.from({ length: 100 }, (_, i) => ({ name: `f${i}.png` }));
  const list = jest.fn(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { data: page, error: null };
  });
  const remove = jest.fn(async (paths: string[]) => ({ data: paths.slice(1), error: null }));
  const storage = jest.spyOn(supabase.storage, 'from').mockReturnValue({ list, remove } as never);
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    await deleteMyAccount({ eraseComments: false });
  } finally {
    storage.mockRestore();
    warn.mockRestore();
  }
  expect(list).toHaveBeenCalledTimes(1);
  expect(await signInFails(u)).toBe(true);
});

it('once the account is deleted, a failure tidying up this phone still signs you out and is not an error', async () => {
  const u = await signUp('tidyfail');
  await as(u);
  const forget = jest.spyOn(pushDevice, 'forgetPushDevice').mockRejectedValueOnce(new Error('storage full'));
  const signOut = jest.spyOn(supabase.auth, 'signOut').mockRejectedValueOnce(new Error('storage full'));
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    await deleteMyAccount({ eraseComments: false });
  } finally {
    forget.mockRestore();
    signOut.mockRestore();
    warn.mockRestore();
  }
  expect((await supabase.auth.getSession()).data.session).toBeNull();
  expect(await signInFails(u)).toBe(true);
});

async function waitUntil(check: () => Promise<boolean>) {
  for (let i = 0; i < 50; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('timed out');
}
