import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import Profile from '../../../app/(tabs)/profile';
import DeleteAccount from '../../../app/delete-account';
import RoomScreen from '../../../app/room/[storyId]/[room]';
import StoryScreen from '../../../app/story/[id]';
import { renderScreen } from '../../../test/router';
import { openRoom, postComment } from '../../lib/discussions';
import { saveReview } from '../../lib/reviews';
import { addToLibrary, createManualBook } from '../../lib/stories';
import { supabase } from '../../lib/supabase';

// Profile > Delete my account (docs/DECISIONS.md, "Deleting an account: what happens to comments"):
// the screen says what stays and what goes before you confirm; afterwards your comments and reviews
// show "Deleted reader". Real readers on local Supabase.
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
  expect(screen.getByText(/show “Deleted reader”/)).toBeOnTheScreen();
  expect(screen.getByText(/cannot be undone/)).toBeOnTheScreen();

  // Opting in changes what stays.
  const erase = screen.getByLabelText('Also delete all my comments');
  expect(erase.props.value).toBe(false);
  await fireEvent(erase, 'valueChange', true);
  expect(screen.getByText(/show “This comment was deleted”/)).toBeOnTheScreen();
  expect(screen.queryByText(/show “Deleted reader”/)).toBeNull();
});

it('asks once more, and "Keep my account" keeps it', async () => {
  const u = await signUp('keeper');
  await as(u);
  await renderScreen('en', routes, '/delete-account');
  await fireEvent.press(await screen.findByText('Delete my account', {}, { timeout: 8000 }));
  expect(screen.getByText(/Your account will be deleted right away/)).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Keep my account'));
  expect(screen.queryByText(/Your account will be deleted right away/)).toBeNull();
  expect((await supabase.auth.getSession()).data.session?.user.id).toBe(u.id);
});

it('deleting keeps your comments and reviews, shown as "Deleted reader"', async () => {
  const leaver = await signUp('leaver');
  const stayer = await signUp('stayer');
  await as(leaver);
  const storyId = (await createManualBook({ title: `Goodbye ${run}`, author: 'x', chapters: 2, language: 'en' })).id;
  await addToLibrary(storyId, 'finished');
  const room = (await openRoom(storyId, 'chapter', 1)).id;
  await postComment(room, 'I was here first');
  await saveReview(storyId, 'A book worth leaving behind', false);

  await renderScreen('en', routes, '/delete-account');
  await fireEvent.press(await screen.findByText('Delete my account', {}, { timeout: 8000 }));
  await fireEvent.press(screen.getByText('Yes, delete it forever'));
  await waitFor(async () => expect((await supabase.auth.getSession()).data.session).toBeNull(), { timeout: 8000 });
  expect(await signInFails(leaver)).toBe(true);

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

it('with "Also delete all my comments" on, your comments read "This comment was deleted"', async () => {
  const eraser = await signUp('eraser');
  const stayer = await signUp('stayer2');
  await as(eraser);
  const storyId = (await createManualBook({ title: `Erased ${run}`, author: 'x', chapters: 2, language: 'en' })).id;
  await addToLibrary(storyId, 'finished');
  await postComment((await openRoom(storyId, 'chapter', 1)).id, 'Nobody will read this');

  await renderScreen('en', routes, '/delete-account');
  await fireEvent(await screen.findByLabelText('Also delete all my comments', {}, { timeout: 8000 }), 'valueChange', true);
  await fireEvent.press(screen.getByText('Delete my account'));
  await fireEvent.press(screen.getByText('Yes, delete it forever'));
  await waitFor(async () => expect((await supabase.auth.getSession()).data.session).toBeNull(), { timeout: 8000 });

  await as(stayer);
  await addToLibrary(storyId, 'finished');
  await renderScreen('en', { 'room/[storyId]/[room]': RoomScreen }, `/room/${storyId}/1`);
  expect(await screen.findByText('This comment was deleted', {}, { timeout: 8000 })).toBeOnTheScreen();
  expect(screen.getByText('Deleted reader')).toBeOnTheScreen();
  expect(screen.queryByText('Nobody will read this')).toBeNull();
});

it('in Bulgarian', async () => {
  const u = await signUp('bg');
  await as(u);
  await renderScreen('bg', routes, '/delete-account');
  expect(await screen.findByText('Изтриване на акаунта', {}, { timeout: 8000 })).toBeOnTheScreen();
  expect(screen.getByText('Какво се изтрива')).toBeOnTheScreen();
  expect(screen.getByText('Какво остава')).toBeOnTheScreen();
  expect(screen.getByText(/„Изтрит читател“/)).toBeOnTheScreen();
  expect(screen.getByLabelText('Изтрий и всичките ми коментари')).toBeOnTheScreen();
});
