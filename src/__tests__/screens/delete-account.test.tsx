import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import Profile from '../../../app/(tabs)/profile';
import DeleteAccount from '../../../app/delete-account';
import RoomScreen from '../../../app/room/[storyId]/[room]';
import StoryScreen from '../../../app/story/[id]';
import { failRequests } from '../../../test/network';
import { renderScreen } from '../../../test/router';
import { serviceClient } from '../../../test/service';
import { openRoom, postComment } from '../../lib/discussions';
import * as pushDevice from '../../lib/pushDevice';
import { saveReview } from '../../lib/reviews';
import { addToLibrary, createManualBook } from '../../lib/stories';
import { supabase } from '../../lib/supabase';

// Profile > Delete my account (docs/DECISIONS.md, "Deleting an account: what happens to comments"):
// the screen says what stays and what goes before you confirm, and you must choose what happens to
// your comments: kept as "Deleted reader", or erased. Nothing is chosen for you. Real readers on
// local Supabase.
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

const signInFails = async (u: User) =>
  !!(await supabase.auth.signInWithPassword({ email: u.email, password })).error;

const KEEP = 'Keep my comments and reviews, shown as “Deleted reader”';
const ERASE = 'Erase my comments and delete my reviews';
const deleteButton = () => screen.getByRole('button', { name: 'Delete my account' });

const routes = { profile: Profile, 'delete-account': DeleteAccount };

afterAll(async () => {
  await supabase.removeAllChannels();
  await supabase.auth.signOut();
});

it('Profile links to the delete screen, which says what goes and what stays', async () => {
  const u = await signUp('looker');
  await as(u);
  await renderScreen('en', routes, '/profile');
  await fireEvent.press(await screen.findByText('Delete my account', {}, { timeout: 8000 }));
  expect(await screen.findByText('Delete your account', {}, { timeout: 8000 })).toBeOnTheScreen();
  expect(screen.getByText('What goes')).toBeOnTheScreen();
  expect(screen.getByText(/Your profile, library and reading progress, ratings, reactions/)).toBeOnTheScreen();
  expect(screen.getByText('What stays')).toBeOnTheScreen();
  expect(screen.getByText(/cannot be undone/)).toBeOnTheScreen();

  // Two options, each explained, and neither is chosen for you.
  const keep = screen.getByRole('radio', { name: KEEP });
  const erase = screen.getByRole('radio', { name: ERASE });
  expect(keep).not.toBeChecked();
  expect(erase).not.toBeChecked();
  expect(screen.getByText(/replies to them still make sense/)).toBeOnTheScreen();
  expect(screen.getByText(/“This comment was deleted”/)).toBeOnTheScreen();

  // The options form one group, named by the prompt above them.
  expect(screen.getByRole('radiogroup', { name: 'Choose what happens to your comments and book reviews.' })).toBeOnTheScreen();

  // Until you choose, Delete is disabled.
  expect(deleteButton()).toBeDisabled();

  // Choosing one checks it alone, and enables Delete.
  await fireEvent.press(erase);
  expect(erase).toBeChecked();
  expect(keep).not.toBeChecked();
  expect(deleteButton()).toBeEnabled();
  await fireEvent.press(keep);
  expect(keep).toBeChecked();
  expect(erase).not.toBeChecked();
  expect(deleteButton()).toBeEnabled();
});

it('asks once more, and "Keep my account" keeps it', async () => {
  const u = await signUp('keeper');
  await as(u);
  await renderScreen('en', routes, '/delete-account');
  await fireEvent.press(await screen.findByRole('radio', { name: KEEP }, { timeout: 8000 }));
  await fireEvent.press(deleteButton());
  expect(screen.getByText(/Your account will be deleted right away/)).toBeOnTheScreen();
  // The choice can't change under the confirmation.
  expect(screen.getByRole('radio', { name: KEEP })).toBeDisabled();
  expect(screen.getByRole('radio', { name: ERASE })).toBeDisabled();
  await fireEvent.press(screen.getByText('Keep my account'));
  expect(screen.queryByText(/Your account will be deleted right away/)).toBeNull();
  expect(screen.getByRole('radio', { name: KEEP })).toBeEnabled();
  expect(screen.getByRole('radio', { name: ERASE })).toBeEnabled();
  expect((await supabase.auth.getSession()).data.session?.user.id).toBe(u.id);
});

it('when deleting fails, the account and your choice stay, and the error shows', async () => {
  const u = await signUp('failer');
  await as(u);
  await renderScreen('en', routes, '/delete-account');
  await fireEvent.press(await screen.findByRole('radio', { name: ERASE }, { timeout: 8000 }));
  await fireEvent.press(deleteButton());
  const online = failRequests((url, method) => method === 'POST' && url.includes('/rest/v1/rpc/delete_my_account'));
  try {
    await fireEvent.press(screen.getByText('Yes, delete it forever'));
    expect(await screen.findByText('We couldn’t delete your account. Please try again.', {}, { timeout: 8000 })).toBeOnTheScreen();
  } finally {
    online();
  }
  expect(screen.getByRole('radio', { name: ERASE })).toBeChecked();
  expect(screen.getByRole('radio', { name: KEEP })).not.toBeChecked();
  expect((await supabase.auth.getSession()).data.session?.user.id).toBe(u.id);
  expect(await signInFails(u)).toBe(false);
});

it('deleting keeps your comments and reviews, shown as "Deleted reader"', async () => {
  const leaver = await signUp('leaver');
  const stayer = await signUp('stayer');
  await as(leaver);
  const storyId = (await createManualBook({ title: `Goodbye ${run}`, author: 'x', chapters: 2, language: 'en' })).id;
  await addToLibrary(storyId, 'finished');
  const room = (await openRoom(storyId, 'chapter', 1)).id;
  const comment = await postComment(room, 'I was here first');
  await saveReview(storyId, 'A book worth leaving behind', false);

  await renderScreen('en', routes, '/delete-account');
  await fireEvent.press(await screen.findByRole('radio', { name: KEEP }, { timeout: 8000 }));
  await fireEvent.press(deleteButton());
  await fireEvent.press(screen.getByText('Yes, delete it forever'));
  await waitFor(async () => expect((await supabase.auth.getSession()).data.session).toBeNull(), { timeout: 8000 });
  expect(await signInFails(leaver)).toBe(true);

  // In the database: the comment and the review keep their text and lose their author.
  const db = serviceClient();
  const kept = (await db.from('comments').select('author_id, body, deleted_at').eq('id', comment.id).single().throwOnError()).data;
  expect(kept).toEqual({ author_id: null, body: 'I was here first', deleted_at: null });
  const reviews = (await db.from('reviews').select('user_id, body').eq('story_id', storyId).throwOnError()).data;
  expect(reviews).toEqual([{ user_id: null, body: 'A book worth leaving behind' }]);

  await as(stayer);
  await addToLibrary(storyId, 'finished');
  await renderScreen('en', { 'room/[storyId]/[room]': RoomScreen }, `/room/${storyId}/1`);
  expect(await screen.findByText('I was here first', {}, { timeout: 8000 })).toBeOnTheScreen();
  expect(screen.getByText('Deleted reader')).toBeOnTheScreen();
  expect(screen.queryByText(leaver.username)).toBeNull();
  // There is nobody left to block; the comment itself can still be reported.
  expect(screen.queryByText(/^Block /)).toBeNull();
  expect(screen.getByText('Report')).toBeOnTheScreen();

  await renderScreen('en', { 'story/[id]': StoryScreen }, `/story/${storyId}`);
  expect(await screen.findByText('A book worth leaving behind', {}, { timeout: 8000 })).toBeOnTheScreen();
  expect(screen.getByText('Deleted reader')).toBeOnTheScreen();
});

it('choosing to erase: your comments read "This comment was deleted" and your reviews are deleted', async () => {
  const eraser = await signUp('eraser');
  const stayer = await signUp('stayer2');
  await as(eraser);
  const storyId = (await createManualBook({ title: `Erased ${run}`, author: 'x', chapters: 2, language: 'en' })).id;
  await addToLibrary(storyId, 'finished');
  const comment = await postComment((await openRoom(storyId, 'chapter', 1)).id, 'Nobody will read this');
  await saveReview(storyId, 'Nobody will read this review', false);

  await renderScreen('en', routes, '/delete-account');
  await fireEvent.press(await screen.findByRole('radio', { name: ERASE }, { timeout: 8000 }));
  await fireEvent.press(deleteButton());
  await fireEvent.press(screen.getByText('Yes, delete it forever'));
  await waitFor(async () => expect((await supabase.auth.getSession()).data.session).toBeNull(), { timeout: 8000 });

  // In the database: the comment keeps its place without its text or author; the review is gone.
  const db = serviceClient();
  const erased = (await db.from('comments').select('author_id, body, deleted_at').eq('id', comment.id).single().throwOnError()).data;
  expect(erased?.author_id).toBeNull();
  expect(erased?.body).toBe('[deleted]');
  expect(erased?.deleted_at).not.toBeNull();
  expect((await db.from('reviews').select('id').eq('story_id', storyId).throwOnError()).data).toEqual([]);

  await as(stayer);
  await addToLibrary(storyId, 'finished');
  await renderScreen('en', { 'room/[storyId]/[room]': RoomScreen }, `/room/${storyId}/1`);
  expect(await screen.findByText('This comment was deleted', {}, { timeout: 8000 })).toBeOnTheScreen();
  expect(screen.getByText('Deleted reader')).toBeOnTheScreen();
  expect(screen.queryByText('Nobody will read this')).toBeNull();
});

it('once the account is deleted, a failure tidying up this phone is not shown as a failed deletion', async () => {
  const u = await signUp('tidy');
  await as(u);
  const forget = jest.spyOn(pushDevice, 'forgetPushDevice').mockRejectedValueOnce(new Error('storage full'));
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    await renderScreen('en', routes, '/delete-account');
    await fireEvent.press(await screen.findByRole('radio', { name: KEEP }, { timeout: 8000 }));
    await fireEvent.press(deleteButton());
    await fireEvent.press(screen.getByText('Yes, delete it forever'));
    await waitFor(async () => expect((await supabase.auth.getSession()).data.session).toBeNull(), { timeout: 8000 });
    expect(screen.queryByText('We couldn’t delete your account. Please try again.')).toBeNull();
  } finally {
    forget.mockRestore();
    warn.mockRestore();
  }
  expect(await signInFails(u)).toBe(true);
});

it('in Bulgarian', async () => {
  const u = await signUp('bg');
  await as(u);
  await renderScreen('bg', routes, '/delete-account');
  expect(await screen.findByText('Изтриване на акаунта', {}, { timeout: 8000 })).toBeOnTheScreen();
  expect(screen.getByText('Какво се изтрива')).toBeOnTheScreen();
  expect(screen.getByText('Какво остава')).toBeOnTheScreen();
  expect(screen.getByRole('radio', { name: 'Запази коментарите и ревютата ми, с „Изтрит читател“ вместо името ми' })).not.toBeChecked();
  expect(screen.getByRole('radio', { name: 'Изтрий коментарите и ревютата ми' })).not.toBeChecked();
  expect(screen.getByRole('button', { name: 'Изтрий акаунта ми' })).toBeDisabled();
});
