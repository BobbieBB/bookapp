import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';

import Discover from '../../../app/(tabs)/discover';
import Profile from '../../../app/(tabs)/profile';
import { renderScreen } from '../../../test/router';
import { lively } from '../../lib/discover';
import { addToLibrary, createFic } from '../../lib/stories';
import { supabase } from '../../lib/supabase';

// Discover (docs/DECISIONS.md, 14 Oct 2026) and Profile > Your fandoms. Real readers on local
// Supabase; fandom names carry the run id so other tests' fics don't interfere.
const password = 'test-password-1234';
const run = Date.now().toString(36);
const PICKED = `Picked Fandom ${run}`;
const FROM_LIBRARY = `Library Fandom ${run}`;
const TOGGLE = `Toggle Fandom ${run}`;
const ONLY_WIPS = `Only Wips Fandom ${run}`;
// The "Complete only" choice, remembered per device (the in-memory AsyncStorage is shared by this file's tests).
const COMPLETE_ONLY_KEY = 'livami.discover.completeOnly';
type User = { email: string; id: string };

async function signUp(name: string, profile: Record<string, unknown> = {}): Promise<User> {
  const email = `${name}-${run}@example.test`;
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data.user) throw error ?? new Error(`could not sign up ${email}`);
  await supabase.from('profiles').insert({ id: data.user.id, username: `${name}_${run}`, ...profile }).throwOnError();
  await supabase.auth.signOut();
  return { email, id: data.user.id };
}

async function as(u: User) {
  await supabase.auth.signOut();
  const { error } = await supabase.auth.signInWithPassword({ email: u.email, password });
  if (error) throw error;
}

let n = 0;
const fic = (title: string, fandom: string, complete: boolean) =>
  createFic({
    ao3Link: `https://archiveofourown.org/works/${(parseInt(run, 36) % 1_000_000_000) + 500 + n++}`,
    title,
    author: 'w',
    fandom,
    ship: '',
    complete,
    chapters: 2,
    rating: 'Not Rated',
    warnings: [],
  });

let reader: User;
let bookReader: User;
let filterReader: User;
let wipReader: User;
let popularId: string;

beforeAll(async () => {
  const writer = await signUp('dwriter');
  reader = await signUp('dreader', { favourite_fandoms: [PICKED] });
  bookReader = await signUp('dbooks', { reads_fanfic: false });
  filterReader = await signUp('dfilter', { favourite_fandoms: [TOGGLE] });
  wipReader = await signUp('dwips', { favourite_fandoms: [ONLY_WIPS] });
  await as(writer);
  await addToLibrary((await fic('Toggle WIP', TOGGLE, false)).id, 'currently_reading');
  await addToLibrary((await fic('Toggle complete', TOGGLE, true)).id, 'finished');
  await addToLibrary((await fic('Lonely WIP', ONLY_WIPS, false)).id, 'currently_reading');
  const popular = await fic('Popular WIP', PICKED, false);
  popularId = popular.id;
  await addToLibrary(popular.id, 'currently_reading');
  const other = await fic('Library Fandom Fic', FROM_LIBRARY, true);
  await addToLibrary(other.id, 'finished');
  await as(reader);
  await addToLibrary((await fic('My own fic', FROM_LIBRARY, true)).id, 'currently_reading');
  // The filtered list falls back to complete fics in the starter fandoms; this reader already reads them
  // all, so for them nothing complete is left anywhere.
  await as(wipReader);
  for (let round = 0; round < 5; round++) {
    const left = await lively([ONLY_WIPS], true);
    if (left.length === 0) break;
    for (const story of left) await addToLibrary(story.id, 'finished');
  }
  expect(await lively([ONLY_WIPS], true)).toEqual([]); // the empty-state test's precondition
});

beforeEach(() => AsyncStorage.removeItem(COMPLETE_ONLY_KEY));


function StoryStub() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Text>{`story ${id}`}</Text>;
}

describe('Discover', () => {
  it('shows your fandoms and lively fics you do not read yet', async () => {
    await as(reader);
    await renderScreen('en', { discover: Discover, 'story/[id]': StoryStub }, '/discover');
    expect(await screen.findByText('YOUR FANDOMS', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.getByText(PICKED)).toBeOnTheScreen();
    expect(screen.getByText(FROM_LIBRARY)).toBeOnTheScreen();
    expect(await screen.findByText('Popular WIP', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.getByText('WIP')).toBeOnTheScreen();
    expect(screen.queryByText('My own fic')).toBeNull();
  });

  it('a fandom chip narrows the list; tapping a fic opens it', async () => {
    await as(reader);
    await renderScreen('en', { discover: Discover, 'story/[id]': StoryStub }, '/discover');
    await fireEvent.press(await screen.findByText(FROM_LIBRARY, {}, { timeout: 8000 }));
    expect(await screen.findByText('Library Fandom Fic', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.queryByText('Popular WIP')).toBeNull();
    await fireEvent.press(screen.getByText(FROM_LIBRARY)); // tap again: back to all your fandoms
    await fireEvent.press(await screen.findByText('Popular WIP', {}, { timeout: 8000 }));
    expect(await screen.findByText(`story ${popularId}`, {}, { timeout: 8000 })).toBeOnTheScreen();
  });

  it('Search fandoms searches every fandom in the app', async () => {
    await as(reader);
    await renderScreen('en', { discover: Discover, 'story/[id]': StoryStub }, '/discover');
    await fireEvent.press(await screen.findByText('Search fandoms', {}, { timeout: 8000 }));
    await fireEvent.changeText(screen.getByLabelText('Fandom name, from 3 letters'), `library fandom ${run}`);
    await fireEvent.press(await screen.findByTestId(`fandom-hit-${FROM_LIBRARY}`, {}, { timeout: 8000 }));
    expect(await screen.findByText('Library Fandom Fic', {}, { timeout: 8000 })).toBeOnTheScreen();
  });

  it('in Bulgarian', async () => {
    await as(reader);
    await renderScreen('bg', { discover: Discover, 'story/[id]': StoryStub }, '/discover');
    expect(await screen.findByText('ТВОИТЕ ФЕНДЪМИ', {}, { timeout: 8000 })).toBeOnTheScreen();
  });

  it('readers who only read books are told Discover is for fanfiction for now', async () => {
    await as(bookReader);
    await renderScreen('en', { discover: Discover }, '/discover');
    expect(await screen.findByText('Discover is for fanfiction for now.', {}, { timeout: 8000 })).toBeOnTheScreen();
  });
});

describe('Discover: Complete only', () => {
  const routes = { discover: Discover, 'story/[id]': StoryStub };

  it('the chip hides WIPs and brings them back', async () => {
    await as(filterReader);
    await renderScreen('en', routes, '/discover');
    expect(await screen.findByText('Toggle WIP', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.getByText('Toggle complete')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Complete only'));
    // The filtered list has loaded (not just the old one gone): the complete fic is back, the WIP is not.
    await waitFor(
      () => {
        expect(screen.getByText('Toggle complete')).toBeOnTheScreen();
        expect(screen.queryByText('Toggle WIP')).toBeNull();
      },
      { timeout: 8000 },
    );
    await fireEvent.press(screen.getByText('Complete only'));
    expect(await screen.findByText('Toggle WIP', {}, { timeout: 8000 })).toBeOnTheScreen();
  });

  it('the choice is remembered on this device', async () => {
    await as(filterReader);
    await renderScreen('en', routes, '/discover');
    await fireEvent.press(await screen.findByText('Complete only', {}, { timeout: 8000 }));
    await waitFor(() => expect(screen.queryByText('Toggle WIP')).toBeNull(), { timeout: 8000 });
    screen.unmount();
    await renderScreen('en', routes, '/discover');
    expect(await screen.findByText('Toggle complete', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.queryByText('Toggle WIP')).toBeNull();
    expect(screen.getByRole('button', { name: 'Complete only' })).toBeSelected();
  });

  it('storage that cannot be read leaves the filter off', async () => {
    await AsyncStorage.setItem(COMPLETE_ONLY_KEY, 'true');
    // Only this key fails: the language, appearance and session are still read. (A jest spy would wipe
    // the stand-in's own implementation when restored.)
    const getItem = AsyncStorage.getItem;
    AsyncStorage.getItem = (key, ...rest) => (key === COMPLETE_ONLY_KEY ? Promise.reject(new Error('unreadable')) : getItem(key, ...rest));
    try {
      await as(filterReader);
      await renderScreen('en', routes, '/discover');
      expect(await screen.findByText('Toggle WIP', {}, { timeout: 8000 })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Complete only' })).not.toBeSelected();
    } finally {
      AsyncStorage.getItem = getItem;
    }
  });

  it('a tap while the remembered choice is still being read is not undone by the read', async () => {
    await AsyncStorage.setItem(COMPLETE_ONLY_KEY, 'false');
    const getItem = AsyncStorage.getItem;
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    // The read sees storage as it was before the tap ('false') and answers only after it.
    AsyncStorage.getItem = (key, ...rest) => {
      const value = getItem(key, ...rest);
      return key === COMPLETE_ONLY_KEY ? held.then(() => value) : value;
    };
    try {
      await as(filterReader);
      await renderScreen('en', routes, '/discover');
      await fireEvent.press(await screen.findByText('Complete only', {}, { timeout: 8000 }));
      release();
      await waitFor(
        () => {
          expect(screen.getByText('Toggle complete')).toBeOnTheScreen();
          expect(screen.queryByText('Toggle WIP')).toBeNull();
        },
        { timeout: 8000 },
      );
      expect(screen.getByRole('button', { name: 'Complete only' })).toBeSelected();
    } finally {
      AsyncStorage.getItem = getItem;
    }
  });

  it('a choice that cannot be saved still applies, without an error', async () => {
    const setItem = AsyncStorage.setItem;
    AsyncStorage.setItem = (key, ...rest) => (key === COMPLETE_ONLY_KEY ? Promise.reject(new Error('disk full')) : setItem(key, ...rest));
    try {
      await as(filterReader);
      await renderScreen('en', routes, '/discover');
      expect(await screen.findByText('Toggle WIP', {}, { timeout: 8000 })).toBeOnTheScreen();
      await fireEvent.press(screen.getByText('Complete only'));
      await waitFor(
        () => {
          expect(screen.getByText('Toggle complete')).toBeOnTheScreen();
          expect(screen.queryByText('Toggle WIP')).toBeNull();
        },
        { timeout: 8000 },
      );
      expect(screen.getByRole('button', { name: 'Complete only' })).toBeSelected();
      expect(await AsyncStorage.getItem(COMPLETE_ONLY_KEY)).toBeNull();
    } finally {
      AsyncStorage.setItem = setItem;
    }
  });

  it('with nothing complete anywhere, suggests turning the filter off', async () => {
    await AsyncStorage.setItem(COMPLETE_ONLY_KEY, 'true');
    await as(wipReader);
    await renderScreen('en', routes, '/discover');
    expect(
      await screen.findByText('No complete fics here yet. Turn off "Complete only" to see WIPs too.', {}, { timeout: 8000 }),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Lonely WIP')).toBeNull();
  });

  it('in Bulgarian', async () => {
    await AsyncStorage.setItem(COMPLETE_ONLY_KEY, 'true');
    await as(filterReader);
    await renderScreen('bg', routes, '/discover');
    expect(await screen.findByText('Toggle complete', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Само завършени' })).toBeSelected();
    expect(screen.queryByText('Toggle WIP')).toBeNull();
  });
});

describe('Profile > Your fandoms', () => {
  it('shows picked fandoms and suggests ones from your library; one tap adds it', async () => {
    await as(reader);
    await renderScreen('en', { profile: Profile }, '/profile');
    expect(await screen.findByText('Your fandoms', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.getByText(PICKED)).toBeOnTheScreen();
    await fireEvent.press(await screen.findByLabelText(`Add ${FROM_LIBRARY} to your fandoms`, {}, { timeout: 8000 }));
    expect(await screen.findByLabelText(`Remove ${FROM_LIBRARY} from your fandoms`, {}, { timeout: 8000 })).toBeOnTheScreen();
    const { data } = await supabase.from('profiles').select('favourite_fandoms').eq('id', reader.id).single().throwOnError();
    expect(data!.favourite_fandoms).toEqual([PICKED, FROM_LIBRARY]);
  });
});
