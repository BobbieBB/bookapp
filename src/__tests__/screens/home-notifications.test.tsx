import { fireEvent, screen } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';

import Home from '../../../app/(tabs)/index';
import Notifications from '../../../app/notifications';
import { renderScreen } from '../../../test/router';
import { openRoom, postComment, toggleReaction } from '../../lib/discussions';
import { addToLibrary, createManualBook } from '../../lib/stories';
import { supabase } from '../../lib/supabase';

// Home "REPLIES TO YOU", the Continue Reading hint, and the notifications screen (docs/DECISIONS.md,
// Home: replies to you, not all discussions). Real readers on local Supabase.
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

function RoomStub() {
  const { storyId, room } = useLocalSearchParams<{ storyId: string; room: string }>();
  return <Text>{`room ${storyId} ${room}`}</Text>;
}
function NotificationsStub() {
  return <Text>all notifications</Text>;
}

let me: User;
let pal: User;
let storyId: string;

beforeAll(async () => {
  me = await signUp('homer');
  pal = await signUp('palo');
  await as(pal);
  storyId = (await createManualBook({ title: 'Hint Book', author: 'x', chapters: 3, language: 'en' })).id;
  await addToLibrary(storyId, 'finished');
  await as(me);
  await addToLibrary(storyId, 'currently_reading');
  await supabase.from('library_entries').update({ progress_section: 2 }).eq('story_id', storyId).eq('user_id', me.id).throwOnError();
  const ch2 = (await openRoom(storyId, 'chapter', 2)).id;
  const mine = await postComment(ch2, 'Chapter 2 thoughts');
  await as(pal);
  await postComment(ch2, 'Totally', mine.id);
  await postComment(ch2, `cc @${me.username}`);
  await toggleReaction(mine.id, '🔥', false);
});

describe('Home', () => {
  it('shows replies and mentions to you, never the comment text', async () => {
    await as(me);
    await renderScreen('en', { index: Home, 'room/[storyId]/[room]': RoomStub, notifications: NotificationsStub }, '/');
    expect(await screen.findByText(`${pal.username} mentioned you`, {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.getByText(`${pal.username} replied to you`)).toBeOnTheScreen();
    expect(screen.getAllByText('Hint Book · Chapter 2').length).toBeGreaterThan(0);
    expect(screen.queryByText('Totally')).toBeNull();
    expect(screen.queryByText(`${pal.username} reacted to your comment`)).toBeNull(); // reactions aren't "replies to you"
  });

  it('a reply opens its room; See all opens notifications', async () => {
    await as(me);
    await renderScreen('en', { index: Home, 'room/[storyId]/[room]': RoomStub, notifications: NotificationsStub }, '/');
    await fireEvent.press(await screen.findByText(`${pal.username} replied to you`, {}, { timeout: 8000 }));
    expect(await screen.findByText(`room ${storyId} 2`, {}, { timeout: 8000 })).toBeOnTheScreen();
  });

  it('See all opens the notifications screen', async () => {
    await as(me);
    await renderScreen('en', { index: Home, notifications: NotificationsStub }, '/');
    await fireEvent.press(await screen.findByText('See all', {}, { timeout: 8000 }));
    expect(await screen.findByText('all notifications', {}, { timeout: 8000 })).toBeOnTheScreen();
  });

  it('no See all while there are no replies to you yet', async () => {
    const quiet = await signUp('hush');
    await as(quiet);
    await renderScreen('en', { index: Home, notifications: NotificationsStub }, '/');
    expect(await screen.findByText('When someone replies to you or mentions you, you’ll see it here.', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.queryByText('See all')).toBeNull();
  });

  it('Continue Reading carries a quiet "N new comments in chapter X" hint', async () => {
    await as(me);
    await renderScreen('en', { index: Home }, '/');
    expect(await screen.findByText('2 new comments in chapter 2', {}, { timeout: 8000 })).toBeOnTheScreen();
  });

  it('in Bulgarian', async () => {
    await as(me);
    await renderScreen('bg', { index: Home }, '/');
    expect(await screen.findByText(`${pal.username} те спомена`, {}, { timeout: 8000 })).toBeOnTheScreen();
  });
});

describe('Notifications', () => {
  it('lists replies, mentions and reactions, and marks them read', async () => {
    await as(me);
    await renderScreen('en', { notifications: Notifications, 'room/[storyId]/[room]': RoomStub }, '/notifications');
    expect(await screen.findByText(`${pal.username} reacted to your comment`, {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.getByText(`${pal.username} replied to you`)).toBeOnTheScreen();
    const deadline = Date.now() + 8000;
    let unread = 1;
    while (unread > 0 && Date.now() < deadline) {
      const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', me.id).is('read_at', null);
      unread = count ?? 0;
      if (unread) await new Promise((r) => setTimeout(r, 200));
    }
    expect(unread).toBe(0);
  });

  it('with nothing yet', async () => {
    const quiet = await signUp('quiet');
    await as(quiet);
    await renderScreen('en', { notifications: Notifications }, '/notifications');
    expect(await screen.findByText('Nothing yet. Replies and mentions will show up here.', {}, { timeout: 8000 })).toBeOnTheScreen();
  });
});
