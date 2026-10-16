import { fireEvent, screen } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';

import FinishedScreen from '../../../app/finished/[id]';
import StoryScreen from '../../../app/story/[id]';
import { renderScreen } from '../../../test/router';
import { rateBook, saveReview } from '../../lib/reviews';
import { addToLibrary, createFic, createManualBook } from '../../lib/stories';
import { supabase } from '../../lib/supabase';

// "You finished it!" and book ratings/reviews (docs/DECISIONS.md: "Finishing a fic: no ratings,
// no recs", "Fandom etiquette by design"). Real readers on local Supabase.
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
function FinishedStub() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Text>{`finished ${id}`}</Text>;
}

let me: User;
let other: User;
let bookId: string;
let ficId: string;

beforeAll(async () => {
  other = await signUp('otherreader');
  me = await signUp('finisher');
  await as(me);
  bookId = (await createManualBook({ title: 'Last Page', author: 'x', chapters: 2, language: 'en' })).id;
  await addToLibrary(bookId, 'currently_reading');
  ficId = (
    await createFic({
      ao3Link: `https://archiveofourown.org/works/${(parseInt(run, 36) % 1_000_000_000) + 900}`,
      title: 'Done Fic',
      author: 'w',
      fandom: 'F',
      ship: '',
      complete: true,
      chapters: 2,
      rating: 'Not Rated',
      warnings: [],
    })
  ).id;
  await addToLibrary(ficId, 'finished');
  await as(other);
  await addToLibrary(bookId, 'finished');
  await rateBook(bookId, 3);
  await saveReview(bookId, 'The twist at the end is that the narrator', true);
});

describe('finishing', () => {
  it('marking a story Finished opens "You finished it!"', async () => {
    await as(me);
    await renderScreen('en', { 'story/[id]': StoryScreen, 'finished/[id]': FinishedStub }, `/story/${bookId}`);
    await fireEvent.press(await screen.findByRole('button', { name: 'Finished' }, { timeout: 8000 }));
    expect(await screen.findByText(`finished ${bookId}`, {}, { timeout: 8000 })).toBeOnTheScreen();
  });

  it('a fic: point to AO3 for kudos and recs, no stars; the main button joins The Epilogue', async () => {
    await as(me);
    await renderScreen('en', { 'finished/[id]': FinishedScreen, 'room/[storyId]/[room]': RoomStub }, `/finished/${ficId}`);
    expect(await screen.findByText('You finished it!', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.getByText('Leave kudos, a comment, or bookmark it as a rec on AO3')).toBeOnTheScreen();
    expect(screen.queryByLabelText(/Rate .* stars/)).toBeNull();
    await fireEvent.press(screen.getByText('Join The Epilogue'));
    expect(await screen.findByText(`room ${ficId} epilogue`, {}, { timeout: 8000 })).toBeOnTheScreen();
  });

  it('a book: rate it in half stars and write a review', async () => {
    await as(me);
    await renderScreen('en', { 'finished/[id]': FinishedScreen, 'room/[storyId]/[room]': RoomStub }, `/finished/${bookId}`);
    await fireEvent.press(await screen.findByLabelText('Rate 4.5 stars', {}, { timeout: 8000 }));
    await fireEvent.changeText(screen.getByLabelText('Your review (optional)'), 'Beautiful and strange');
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('Saved', {}, { timeout: 8000 })).toBeOnTheScreen();
    const { data } = await supabase.from('ratings').select('rating').eq('story_id', bookId).eq('user_id', me.id).single().throwOnError();
    expect(Number(data!.rating)).toBe(4.5);
    expect(screen.getByText('Join The Epilogue')).toBeOnTheScreen();
  });

  it('in Bulgarian', async () => {
    await as(me);
    await renderScreen('bg', { 'finished/[id]': FinishedScreen }, `/finished/${ficId}`);
    expect(await screen.findByText('Прочете го!', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.getByText('Влез в Епилога')).toBeOnTheScreen();
  });
});

describe('a book page', () => {
  it('shows the average rating and reviews, with spoilers hidden until you tap', async () => {
    await as(me);
    await renderScreen('en', { 'story/[id]': StoryScreen }, `/story/${bookId}`);
    expect(await screen.findByText('★ 3.8 · 2 ratings', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.queryByText('The twist at the end is that the narrator')).toBeNull();
    await fireEvent.press(screen.getByText('Contains spoilers. Tap to show.'));
    expect(screen.getByText('The twist at the end is that the narrator')).toBeOnTheScreen();
    expect(screen.getByText('Beautiful and strange')).toBeOnTheScreen();
  });

  it('a fic page shows no ratings or reviews', async () => {
    await as(me);
    await renderScreen('en', { 'story/[id]': StoryScreen }, `/story/${ficId}`);
    await screen.findByTestId('story-title', {}, { timeout: 8000 });
    expect(screen.queryByText(/ratings?$/)).toBeNull();
    expect(screen.queryByText('REVIEWS')).toBeNull();
  });
});
