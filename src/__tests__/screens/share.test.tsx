import { act, fireEvent, screen } from '@testing-library/react-native';
import * as ExpoLinking from 'expo-linking';
import { Text } from 'react-native';

import TabsLayout from '../../../app/(tabs)/_layout';
import { RootStack } from '../../../app/_layout';
import SignIn from '../../../app/sign-in';
import StoryScreen from '../../../app/story/[id]';
import { serviceClient } from '../../../test/service';
import { renderScreen } from '../../../test/router';
import { resetPendingStoryLink } from '../../components/PendingStoryLink';
import { TERMS_VERSION } from '../../lib/legal';
import { createFic } from '../../lib/stories';
import { supabase } from '../../lib/supabase';

// "Share with a friend" (PO, 16 Nov 2026): what the friend's tap on livami://story/<id> opens. Real readers on
// local Supabase; invented fics only.
const password = 'test-password-1234';
const run = Date.now().toString(36);
type User = { email: string; id: string };

async function signUp(name: string): Promise<User> {
  await supabase.auth.signOut();
  const email = `${name}-${run}@example.test`;
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data.user) throw error ?? new Error(`could not sign up ${email}`);
  await supabase
    .from('profiles')
    .insert({ id: data.user.id, username: `${name}_${run}`, terms_version: TERMS_VERSION, age_confirmed: true })
    .throwOnError();
  return { email, id: data.user.id };
}

let n = 0;
const fic = (title: string) =>
  createFic({
    ao3Link: `https://archiveofourown.org/works/${(parseInt(run, 36) % 1_000_000_000) + 3300 + n++}`,
    title,
    author: 'someone',
    fandom: `Share Fandom ${run}`,
    ship: '',
    complete: true,
    chapters: 3,
    rating: 'Not Rated',
    warnings: [],
  });

let sharer: User;
let friend: User;
let sharedId: string;
let hiddenId: string;

beforeAll(async () => {
  friend = await signUp('friend');
  sharer = await signUp('sharer');
  sharedId = (await fic(`Shared Fic ${run}`)).id;
  hiddenId = (await fic(`Taken Down ${run}`)).id;
  await serviceClient().from('stories').update({ is_hidden: true }).eq('id', hiddenId).throwOnError();
});

afterEach(() => {
  jest.restoreAllMocks();
  resetPendingStoryLink();
});

afterAll(async () => {
  await supabase.removeAllChannels();
  await supabase.auth.signOut();
});

describe('a story that is not available', () => {
  const routes = { index: () => <Text>home</Text>, 'story/[id]': StoryScreen };

  it('hidden: says so, with no Try again', async () => {
    await supabase.auth.signInWithPassword({ email: friend.email, password });
    await renderScreen('en', routes, `/story/${hiddenId}`);
    expect(await screen.findByText('This story isn’t available', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.queryByText('Try again')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('home', {}, { timeout: 8000 })).toBeOnTheScreen();
  });

  it('a link with no such story, or not an id at all', async () => {
    await supabase.auth.signInWithPassword({ email: friend.email, password });
    await renderScreen('en', routes, '/story/00000000-0000-4000-8000-000000000000');
    expect(await screen.findByText('This story isn’t available', {}, { timeout: 8000 })).toBeOnTheScreen();
    screen.unmount();
    await renderScreen('bg', routes, '/story/not-a-story');
    expect(await screen.findByText('Тази история не е достъпна', {}, { timeout: 8000 })).toBeOnTheScreen();
  });

  it('its creator still sees a hidden story, without Share', async () => {
    await supabase.auth.signInWithPassword({ email: sharer.email, password });
    await renderScreen('en', routes, `/story/${hiddenId}`);
    expect(await screen.findByTestId('story-title', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.queryByText('Share with a friend')).toBeNull();
    screen.unmount();
    await renderScreen('en', routes, `/story/${sharedId}`);
    expect(await screen.findByText('Share with a friend', {}, { timeout: 8000 })).toBeOnTheScreen();
  });
});

it('a friend who is signed out signs in first, then the shared story opens', async () => {
  await supabase.auth.signOut();
  jest.spyOn(ExpoLinking, 'useLinkingURL').mockReturnValue(`livami://story/${sharedId}`);
  const app = {
    _layout: RootStack,
    'sign-in': SignIn,
    '(tabs)/_layout': TabsLayout,
    '(tabs)/index': () => <Text>home</Text>,
    'story/[id]': StoryScreen,
  };
  await renderScreen('en', app, `/story/${sharedId}`);
  expect(await screen.findByLabelText('Email', {}, { timeout: 8000 })).toBeOnTheScreen();
  await act(async () => {
    await supabase.auth.signInWithPassword({ email: friend.email, password });
  });
  expect(await screen.findByTestId('story-title', {}, { timeout: 8000 })).toHaveTextContent(`Shared Fic ${run}`);
  expect(screen.getAllByTestId('story-title')).toHaveLength(1); // opened once, not twice
});

it('a friend already in the app: the router opens the story, nothing opens it a second time', async () => {
  await supabase.auth.signInWithPassword({ email: friend.email, password });
  jest.spyOn(ExpoLinking, 'useLinkingURL').mockReturnValue(`livami://story/${sharedId}`);
  const app = {
    _layout: RootStack,
    'sign-in': SignIn,
    '(tabs)/_layout': TabsLayout,
    '(tabs)/index': () => <Text>home</Text>,
    'story/[id]': StoryScreen,
  };
  await renderScreen('en', app, `/story/${sharedId}`);
  expect(await screen.findByTestId('story-title', {}, { timeout: 8000 })).toHaveTextContent(`Shared Fic ${run}`);
  await new Promise((r) => setTimeout(r, 500));
  expect(screen.getAllByTestId('story-title')).toHaveLength(1);
});
