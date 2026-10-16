import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import Profile from '../../../app/(tabs)/profile';
import Authors from '../../../app/authors';
import Blocked from '../../../app/blocked';
import Feedback from '../../../app/feedback';
import RoomScreen from '../../../app/room/[storyId]/[room]';
import { renderScreen } from '../../../test/router';
import { openRoom, postComment } from '../../lib/discussions';
import { block } from '../../lib/safety';
import { addToLibrary, createManualBook } from '../../lib/stories';
import { supabase } from '../../lib/supabase';

// Report, block, feedback and the Authors are welcome page (docs/DECISIONS.md: Fandom etiquette
// by design, MVP v1). Real readers on local Supabase.
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
let troll: User;
let storyId: string;
let trollCommentId: string;

beforeAll(async () => {
  me = await signUp('kind');
  troll = await signUp('troll');
  await as(troll);
  storyId = (await createManualBook({ title: 'Safe Book', author: 'x', chapters: 2, language: 'en' })).id;
  await addToLibrary(storyId, 'finished');
  const ch1 = (await openRoom(storyId, 'chapter', 1)).id;
  trollCommentId = (await postComment(ch1, 'You all have bad taste')).id;
  await as(me);
  await addToLibrary(storyId, 'finished');
});

afterAll(async () => {
  await supabase.removeAllChannels();
  await supabase.auth.signOut();
});

const rows = async (table: string, column: string) =>
  (await supabase.from(table).select('*').eq(column, me.id).throwOnError()).data ?? [];

describe('in a discussion', () => {
  it('a comment can be reported with a reason', async () => {
    await as(me);
    await renderScreen('en', { 'room/[storyId]/[room]': RoomScreen }, `/room/${storyId}/1`);
    const card = await screen.findByTestId(`comment-${trollCommentId}`, {}, { timeout: 8000 });
    await fireEvent.press(within(card).getByLabelText(`Report comment by ${troll.username}`));
    await fireEvent.press(screen.getByText('Harassment'));
    await fireEvent.press(screen.getByText('Send report'));
    expect(await screen.findByText('Thanks. A moderator will take a look.', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(within(card).queryByText('Report')).toBeNull(); // reported once is enough
    expect(screen.queryByLabelText(`Report comment by ${troll.username}`)).toBeNull();
    expect((await rows('reports', 'reporter_id')).map((r) => [r.comment_id, r.reason])).toEqual([[trollCommentId, 'harassment']]);
  });

  it('blocking someone hides their comments', async () => {
    await as(me);
    await renderScreen('en', { 'room/[storyId]/[room]': RoomScreen }, `/room/${storyId}/1`);
    const card = await screen.findByTestId(`comment-${trollCommentId}`, {}, { timeout: 8000 });
    await fireEvent.press(within(card).getByText(`Block ${troll.username}`));
    await fireEvent.press(await screen.findByText('Block', {}, { timeout: 8000 }));
    await screen.findByText('Blocked. You won’t see their comments any more.', {}, { timeout: 8000 });
    await waitFor(() => expect(screen.queryByText('You all have bad taste')).toBeNull(), { timeout: 8000 });
  });

  it('your own comments have no report or block actions', async () => {
    await as(me);
    const ch1 = (await openRoom(storyId, 'chapter', 1)).id;
    const mine = (await postComment(ch1, 'My own comment')).id;
    await renderScreen('en', { 'room/[storyId]/[room]': RoomScreen }, `/room/${storyId}/1`);
    const card = await screen.findByTestId(`comment-${mine}`, {}, { timeout: 8000 });
    expect(within(card).queryByText('Report')).toBeNull();
  });
});

describe('blocked readers', () => {
  it('are listed in Profile and can be unblocked', async () => {
    await as(me);
    await block(troll.id);
    await renderScreen('en', { blocked: Blocked }, '/blocked');
    expect(await screen.findByText(troll.username, {}, { timeout: 8000 })).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText(`Unblock ${troll.username}`));
    expect(await screen.findByText('You haven’t blocked anyone.', {}, { timeout: 8000 })).toBeOnTheScreen();
  });
});

describe('feedback', () => {
  it('is sent with its kind', async () => {
    await as(me);
    await renderScreen('en', { feedback: Feedback }, '/feedback');
    await fireEvent.press(await screen.findByText('Idea', {}, { timeout: 8000 }));
    await fireEvent.changeText(screen.getByLabelText('Your feedback'), 'Let me sort my library by author');
    await fireEvent.press(screen.getByText('Send feedback'));
    expect(await screen.findByText('Thank you! We read every message.', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect((await rows('feedback', 'user_id')).map((r) => [r.kind, r.body])).toEqual([['idea', 'Let me sort my library by author']]);
  });
});

describe('Authors are welcome', () => {
  it('explains how the app treats fics and takes removal requests', async () => {
    await as(me);
    await renderScreen('en', { authors: Authors }, '/authors');
    expect(await screen.findByText('Authors are welcome here', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.getByText('Every fic is a gift. Cherish it. Protect it.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Link to your fic on AO3'), 'not a link');
    await fireEvent.press(screen.getByText('Ask us to hide it'));
    expect(await screen.findByText('That doesn’t look like an AO3 work link.', {}, { timeout: 8000 })).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Link to your fic on AO3'), 'https://archiveofourown.org/works/777777');
    await fireEvent.changeText(screen.getByLabelText('How can we reach you?'), 'author@example.test');
    await fireEvent.press(screen.getByText('Ask us to hide it'));
    expect(await screen.findByText('Thanks. We’ll hide it as soon as we can.', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect((await rows('removal_requests', 'requester_id')).map((r) => r.story_url)).toEqual(['https://archiveofourown.org/works/777777']);
  });

  it('in Bulgarian', async () => {
    await as(me);
    await renderScreen('bg', { authors: Authors }, '/authors');
    expect(await screen.findByText('Авторите са добре дошли тук', {}, { timeout: 8000 })).toBeOnTheScreen();
  });
});

describe('Profile', () => {
  it('links to Authors are welcome, feedback and blocked readers', async () => {
    await as(me);
    await renderScreen('en', { profile: Profile, authors: Authors, feedback: Feedback, blocked: Blocked }, '/profile');
    expect(await screen.findByText('Send feedback', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.getByText('Blocked readers')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Read more and ask to hide a fic'));
    expect(await screen.findByLabelText('Link to your fic on AO3', {}, { timeout: 8000 })).toBeOnTheScreen();
  });
});
