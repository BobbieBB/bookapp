import { fireEvent, screen } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';

import Discover from '../../../app/(tabs)/discover';
import Profile from '../../../app/(tabs)/profile';
import { renderScreen } from '../../../test/router';
import { addToLibrary, createFic } from '../../lib/stories';
import { supabase } from '../../lib/supabase';

// Discover (docs/DECISIONS.md, 14 Oct 2026) and Profile > Your fandoms. Real readers on local
// Supabase; fandom names carry the run id so other tests' fics don't interfere.
const password = 'test-password-1234';
const run = Date.now().toString(36);
const PICKED = `Picked Fandom ${run}`;
const FROM_LIBRARY = `Library Fandom ${run}`;
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
let popularId: string;

beforeAll(async () => {
  const writer = await signUp('dwriter');
  reader = await signUp('dreader', { favourite_fandoms: [PICKED] });
  bookReader = await signUp('dbooks', { reads_fanfic: false });
  await as(writer);
  const popular = await fic('Popular WIP', PICKED, false);
  popularId = popular.id;
  await addToLibrary(popular.id, 'currently_reading');
  const other = await fic('Library Fandom Fic', FROM_LIBRARY, true);
  await addToLibrary(other.id, 'finished');
  await as(reader);
  await addToLibrary((await fic('My own fic', FROM_LIBRARY, true)).id, 'currently_reading');
});


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

  it('All fandoms searches every fandom in the app', async () => {
    await as(reader);
    await renderScreen('en', { discover: Discover, 'story/[id]': StoryStub }, '/discover');
    await fireEvent.press(await screen.findByText('All fandoms', {}, { timeout: 8000 }));
    await fireEvent.changeText(screen.getByLabelText('Search fandoms'), `library fandom ${run}`);
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
