import { setAdmin } from '../../../test/database';
import { loadComments, openRoom, postComment } from '../discussions';
import { ACTIONS, fetchQueue, requestChapterCount, resolve } from '../moderation';
import { reportComment } from '../safety';
import { addToLibrary, createManualBook } from '../stories';
import { supabase } from '../supabase';

// The moderation queue and chapter-count requests (docs/DECISIONS.md: Moderation in v1).
// Real readers and a real admin on local Supabase; the queue is shared with other tests, so we
// only look at our own items.
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

let admin: User;
let author: User;
let reporter: User;
let bookId: string;
let roomId: string;
let commentId: string;

beforeAll(async () => {
  admin = await signUp('mod');
  author = await signUp('talker');
  reporter = await signUp('flagger');
  setAdmin(admin.id, true);

  await as(author);
  const book = await createManualBook({ title: `Moderated ${run}`, author: 'x', chapters: 10, language: 'en' });
  bookId = book.id;
  await addToLibrary(bookId, 'finished');
  roomId = (await openRoom(bookId, 'chapter', 1)).id;
  commentId = (await postComment(roomId, 'buy my stuff at spam.example')).id;

  await as(reporter);
  await addToLibrary(bookId, 'finished');
  await reportComment(commentId, 'spam', 'an advert');
});

afterAll(async () => {
  await supabase.auth.signOut();
});

it('an admin sees a real reported comment and hides it; other readers no longer see it', async () => {
  await as(admin);
  const item = (await fetchQueue()).find((i) => i.kind === 'comment_report' && i.story_id === bookId);
  expect(item).toMatchObject({
    story_title: `Moderated ${run}`,
    subject: author.username,
    excerpt: 'buy my stuff at spam.example',
    reason: 'spam',
    details: 'an advert',
    reporter_count: 1,
  });
  expect(ACTIONS[item!.kind]).toContain('hide');

  await resolve('comment_report', item!.id, 'hide');

  expect((await fetchQueue()).some((i) => i.id === item!.id)).toBe(false);
  await as(reporter);
  expect((await loadComments(roomId)).map((c) => c.id)).not.toContain(commentId);
});

it('resolving an item twice is refused with a plain message', async () => {
  await as(admin);
  const { data } = await supabase.from('reports').select('id').eq('comment_id', commentId).single().throwOnError();
  await expect(resolve('comment_report', data!.id, 'dismiss')).rejects.toMatchObject({ message: 'this item is already resolved' });
});

it('a reader is refused the queue and cannot resolve anything', async () => {
  await as(reporter);
  await expect(fetchQueue()).rejects.toMatchObject({ code: '42501', message: 'only admins can see the moderation queue' });
  await expect(resolve('feedback', '00000000-0000-0000-0000-000000000000', 'done')).rejects.toMatchObject({
    code: '42501',
    message: 'only admins can resolve moderation items',
  });
});

it('a reader asks for another chapter count; a duplicate is refused; an admin accepts it', async () => {
  await as(reporter);
  await requestChapterCount(bookId, 12);
  await expect(requestChapterCount(bookId, 14)).rejects.toMatchObject({ code: '23505' });
  await expect(requestChapterCount(bookId, 10)).rejects.toMatchObject({ code: '42501' }); // same as now

  await as(admin);
  const item = (await fetchQueue()).find((i) => i.kind === 'chapter_count' && i.story_id === bookId);
  expect(item).toMatchObject({ current_count: 10, proposed_count: 12, subject: reporter.username });
  await resolve('chapter_count', item!.id, 'accept');
  const { data } = await supabase.from('stories').select('total_sections').eq('id', bookId).single().throwOnError();
  expect(data!.total_sections).toBe(12);
});
