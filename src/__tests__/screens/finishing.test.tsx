import { act, fireEvent, screen } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import FinishedScreen from '../../../app/finished/[id]';
import StoryScreen from '../../../app/story/[id]';
import { renderScreen } from '../../../test/router';
import { loadReviews, rateBook, saveReview } from '../../lib/reviews';
import type { LibraryStatus } from '../../lib/types';
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
let n = 0;

async function book(status: LibraryStatus | null) {
  const b = await createManualBook({ title: `Last Page ${run} ${n++}`, author: 'x', chapters: 2, language: 'en' });
  if (status) await addToLibrary(b.id, status);
  return b.id;
}

async function fic(complete = true) {
  const id = (
    await createFic({
      ao3Link: `https://archiveofourown.org/works/${(parseInt(run, 36) % 1_000_000_000) + 900 + n++}`,
      title: 'Done Fic',
      author: 'w',
      fandom: 'F',
      ship: '',
      complete,
      chapters: 2,
      rating: 'Not Rated',
      warnings: [],
    })
  ).id;
  await addToLibrary(id, 'finished');
  return id;
}

const finishedRoutes = { 'finished/[id]': FinishedScreen, 'room/[storyId]/[room]': RoomStub, 'story/[id]': StoryScreen };

beforeAll(async () => {
  other = await signUp('otherreader');
  me = await signUp('finisher');
});

describe('finishing', () => {
  it('marking a story Finished opens "You finished it!"', async () => {
    await as(me);
    const id = await book('currently_reading');
    await renderScreen('en', { 'story/[id]': StoryScreen, 'finished/[id]': FinishedStub }, `/story/${id}`);
    await fireEvent.press(await screen.findByRole('button', { name: 'Finished' }, { timeout: 8000 }));
    expect(await screen.findByText(`finished ${id}`, {}, { timeout: 8000 })).toBeOnTheScreen();
  });

  it('tapping Finished on an already finished story stays on the story page', async () => {
    await as(me);
    const id = await book('finished');
    await renderScreen('en', { 'story/[id]': StoryScreen, 'finished/[id]': FinishedStub }, `/story/${id}`);
    await fireEvent.press(await screen.findByRole('button', { name: 'Finished' }, { timeout: 8000 }));
    await act(async () => new Promise((r) => setTimeout(r, 1500)));
    expect(screen.queryByText(`finished ${id}`)).toBeNull();
    expect(screen.getByTestId('story-title')).toBeOnTheScreen();
  });

  it('a fic: point to AO3 for kudos and recs, no stars; the main button joins The Epilogue', async () => {
    await as(me);
    const id = await fic();
    await renderScreen('en', finishedRoutes, `/finished/${id}`);
    expect(await screen.findByText('You finished it!', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.getByText('Leave kudos, a comment, or bookmark it as a rec on AO3:')).toBeOnTheScreen();
    expect(screen.queryByLabelText(/^Rate /)).toBeNull();
    expect(screen.queryByLabelText('Your review (optional)')).toBeNull();
    expect(screen.queryByText('Save')).toBeNull();
    await fireEvent.press(screen.getByText('Join The Epilogue'));
    expect(await screen.findByText(`room ${id} epilogue`, {}, { timeout: 8000 })).toBeOnTheScreen();
  });

  it('a WIP fic marked Finished: caught up, no door to The Epilogue (it opens when the story is complete)', async () => {
    await as(me);
    const id = await fic(false);
    await renderScreen('en', finishedRoutes, `/finished/${id}`);
    expect(await screen.findByText('You’re caught up!', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(
      screen.getByText('It’s still a WIP, so The Epilogue opens once the story is complete. Until then, the chapter discussions are open.'),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Join The Epilogue')).toBeNull();
    expect(screen.getByText('Back to the story')).toBeOnTheScreen();
  });

  it('a book you are still reading: no rating, review or Epilogue, a way back to the story', async () => {
    await as(me);
    const id = await book('currently_reading');
    await renderScreen('en', finishedRoutes, `/finished/${id}`);
    expect(await screen.findByText('Finish the story first to rate it and join The Epilogue.', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.queryByText('Join The Epilogue')).toBeNull();
    expect(screen.queryByLabelText(/^Rate /)).toBeNull();
    expect(screen.queryByLabelText('Your review (optional)')).toBeNull();
    await fireEvent.press(screen.getByText('Back to the story'));
    expect(await screen.findByTestId('story-title', {}, { timeout: 8000 })).toBeOnTheScreen();
  });

  it('a book: rate it in half stars and write a review', async () => {
    await as(me);
    const id = await book('finished');
    await renderScreen('en', finishedRoutes, `/finished/${id}`);
    await fireEvent.press(await screen.findByLabelText('Rate 4.5 stars', {}, { timeout: 8000 }));
    await fireEvent.changeText(screen.getByLabelText('Your review (optional)'), 'Beautiful and strange');
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('Saved', {}, { timeout: 8000 })).toBeOnTheScreen();
    const { data } = await supabase.from('ratings').select('rating').eq('story_id', id).eq('user_id', me.id).single().throwOnError();
    expect(Number(data!.rating)).toBe(4.5);
    expect(screen.getByText('Join The Epilogue')).toBeOnTheScreen();
  });

  it('rating labels are plural-aware and every rating button is at least 44 x 44', async () => {
    await as(me);
    const id = await book('finished');
    await renderScreen('en', finishedRoutes, `/finished/${id}`);
    await screen.findByLabelText('Rate 4.5 stars', {}, { timeout: 8000 });
    expect(screen.getByLabelText('Rate 1 star')).toBeOnTheScreen();
    expect(screen.getByLabelText('Rate 0.5 stars')).toBeOnTheScreen();
    expect(screen.getByLabelText('Rate 5 stars')).toBeOnTheScreen();
    const buttons = screen.getAllByLabelText(/^Rate /);
    expect(buttons).toHaveLength(10);
    for (const b of buttons) {
      const style = StyleSheet.flatten(b.props.style);
      expect(style.minWidth).toBeGreaterThanOrEqual(44);
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
  });

  it('the Bulgarian rating labels', async () => {
    await as(me);
    const id = await book('finished');
    await renderScreen('bg', finishedRoutes, `/finished/${id}`);
    expect(await screen.findByLabelText('Оцени с 1 звезда', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.getByLabelText('Оцени с 4.5 звезди')).toBeOnTheScreen();
  });

  it('Save is disabled while there is nothing to save', async () => {
    await as(me);
    const id = await book('finished');
    await renderScreen('en', finishedRoutes, `/finished/${id}`);
    await screen.findByLabelText('Your review (optional)', {}, { timeout: 8000 });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(screen.queryByText('Saved')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Your review (optional)'), 'Something');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('the review field is capped at 10000 characters', async () => {
    await as(me);
    const id = await book('finished');
    await renderScreen('en', finishedRoutes, `/finished/${id}`);
    const field = await screen.findByLabelText('Your review (optional)', {}, { timeout: 8000 });
    expect(field.props.maxLength).toBe(10000);
  });

  it('when the rating saves but the review does not, it says so', async () => {
    await as(me);
    const id = await book('finished');
    await renderScreen('en', finishedRoutes, `/finished/${id}`);
    await fireEvent.press(await screen.findByLabelText('Rate 4 stars', {}, { timeout: 8000 }));
    // changeText ignores maxLength, so this reaches the database, which refuses more than 10000.
    await fireEvent.changeText(screen.getByLabelText('Your review (optional)'), 'x'.repeat(10001));
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('Your rating is saved, but the review wasn’t. Try again.', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.queryByText('Saved')).toBeNull();
    const { data } = await supabase.from('ratings').select('rating').eq('story_id', id).eq('user_id', me.id).single().throwOnError();
    expect(Number(data!.rating)).toBe(4);
  });

  it('in Bulgarian', async () => {
    await as(me);
    const id = await fic();
    await renderScreen('bg', finishedRoutes, `/finished/${id}`);
    expect(await screen.findByText('Прочете го!', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.getByText('Влез в Епилога')).toBeOnTheScreen();
  });
});

describe('a book page', () => {
  it('shows the average rating and reviews, with spoilers hidden until you tap', async () => {
    await as(other);
    const id = await book('finished');
    await rateBook(id, 3);
    await saveReview(id, 'The twist at the end is that the narrator', true);
    await as(me);
    await addToLibrary(id, 'finished');
    await rateBook(id, 4.5);
    await saveReview(id, 'Beautiful and strange', false);
    await renderScreen('en', { 'story/[id]': StoryScreen }, `/story/${id}`);
    expect(await screen.findByText('★ 3.8 · 2 ratings', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.queryByText('The twist at the end is that the narrator')).toBeNull();
    await fireEvent.press(screen.getByText('Contains spoilers. Tap to show.'));
    expect(screen.getByText('The twist at the end is that the narrator')).toBeOnTheScreen();
    expect(screen.getByText('Beautiful and strange')).toBeOnTheScreen();
  });

  it('shows a new rating when it comes back into view', async () => {
    await as(me);
    const id = await book('finished');
    await rateBook(id, 3);
    await renderScreen('en', finishedRoutes, `/story/${id}`);
    expect(await screen.findByText('★ 3.0 · 1 rating', {}, { timeout: 8000 })).toBeOnTheScreen();
    await act(async () => router.push(`/finished/${id}`));
    await screen.findByLabelText('Rate 5 stars', {}, { timeout: 8000 });
    await rateBook(id, 5);
    await act(async () => router.back());
    expect(await screen.findByText('★ 5.0 · 1 rating', {}, { timeout: 8000 })).toBeOnTheScreen();
  });

  it('a fic page shows no ratings or reviews', async () => {
    await as(me);
    const id = await fic();
    await renderScreen('en', { 'story/[id]': StoryScreen }, `/story/${id}`);
    await screen.findByTestId('story-title', {}, { timeout: 8000 });
    expect(screen.queryByText(/ratings?$/)).toBeNull();
    expect(screen.queryByText('REVIEWS')).toBeNull();
  });
});

describe('reviews list', () => {
  it('loads at most 50 reviews, newest first', async () => {
    await as(me);
    const id = await book('finished');
    const readers: User[] = [];
    for (let i = 0; i < 51; i++) readers.push(await signUp(`rev${i}`));
    for (const [i, u] of readers.entries()) {
      await as(u);
      await addToLibrary(id, 'finished');
      await saveReview(id, `review ${i}`, false);
    }
    await as(me);
    const shown = await loadReviews(id);
    expect(shown).toHaveLength(50);
    expect(shown[0].body).toBe('review 50');
    expect(shown.some((r) => r.body === 'review 0')).toBe(false);
  }, 120000);
});
