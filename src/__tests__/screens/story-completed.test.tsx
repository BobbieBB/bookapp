import { fireEvent, screen } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';

import Home from '../../../app/(tabs)/index';
import { renderScreen } from '../../../test/router';
import { markComplete } from '../../lib/story';
import { addToLibrary, createFic } from '../../lib/stories';
import { supabase } from '../../lib/supabase';

// "[Fic] is complete. The Epilogue is open." on Home (docs/DECISIONS.md, Finishing a WIP fic). Real readers
// on local Supabase.
const password = 'test-password-1234';
const run = Date.now().toString(36);
const TITLE = `Long awaited ${run}`;
type User = { email: string; id: string };

async function signUp(name: string): Promise<User> {
  const email = `${name}-${run}@example.test`;
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data.user) throw error ?? new Error(`could not sign up ${email}`);
  await supabase.from('profiles').insert({ id: data.user.id, username: `${name}_${run}`, reads_fanfic: true }).throwOnError();
  await supabase.auth.signOut();
  return { email, id: data.user.id };
}

async function as(u: User) {
  await supabase.auth.signOut();
  const { error } = await supabase.auth.signInWithPassword({ email: u.email, password });
  if (error) throw error;
}

function StoryStub() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Text>{`story ${id}`}</Text>;
}

let reader: User;
let storyId: string;

beforeAll(async () => {
  const marker = await signUp('scmarker');
  reader = await signUp('screader');
  await as(marker);
  storyId = (
    await createFic({
      ao3Link: `https://archiveofourown.org/works/${(parseInt(run, 36) % 1_000_000_000) + 1700}`,
      title: TITLE,
      author: 'w',
      fandom: `Done Screen ${run}`,
      ship: '',
      complete: false,
      chapters: 2,
      rating: 'Not Rated',
      warnings: [],
    })
  ).id;
  await addToLibrary(storyId, 'currently_reading');
  await supabase.from('library_entries').update({ progress_section: 2 }).eq('story_id', storyId).eq('user_id', marker.id).throwOnError();
  await as(reader);
  await addToLibrary(storyId, 'currently_reading');
  await as(marker);
  await markComplete(storyId);
});

afterAll(async () => {
  await supabase.auth.signOut();
});

it('Home tells the other readers, and the notice opens the fic', async () => {
  await as(reader);
  await renderScreen('en', { index: Home, 'story/[id]': StoryStub }, '/');
  await fireEvent.press(await screen.findByText(`${TITLE} is complete. The Epilogue is open.`, {}, { timeout: 8000 }));
  expect(await screen.findByText(`story ${storyId}`, {}, { timeout: 8000 })).toBeOnTheScreen();
});

it('in Bulgarian', async () => {
  await as(reader);
  await renderScreen('bg', { index: Home, 'story/[id]': StoryStub }, '/');
  expect(await screen.findByText(`${TITLE} е завършен. Епилогът е отворен.`, {}, { timeout: 8000 })).toBeOnTheScreen();
});
