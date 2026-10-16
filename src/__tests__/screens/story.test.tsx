import { fireEvent, screen, within } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';

import StoryScreen from '../../../app/story/[id]';
import { renderScreen } from '../../../test/router';
import type { Language } from '../../i18n';
import { addToLibrary, createBook, createFic, createManualBook } from '../../lib/stories';
import { supabase } from '../../lib/supabase';

// The story page (docs/DECISIONS.md: "Reading progress", "Who can change a WIP fic's chapters",
// "Fic details in v1"). A real reader in the local Supabase stack.
const password = 'test-password-1234';
const run = Date.now().toString(36);
const email = `story-${run}@example.test`;
let me: string;
let bookId: string;
let wipId: string;
let strangerBookId: string;

const entry = async (storyId: string) =>
  (await supabase.from('library_entries').select('status, is_favourite, progress_section, progress_page').eq('story_id', storyId).eq('user_id', me).single().throwOnError()).data!;

beforeAll(async () => {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data.user) throw error ?? new Error('could not sign up');
  me = data.user.id;
  await supabase.from('profiles').insert({ id: me, username: `story_${run}` }).throwOnError();

  const book = await createBook(
    { key: `/works/OL${run}SW`, title: 'Ten Chapters', author: 'A. Writer', year: 2001, pages: 300, coverUrl: null },
    { chapters: 10 },
    'en',
  );
  bookId = book.id;
  await addToLibrary(bookId, 'currently_reading');
  await supabase.from('library_entries').update({ progress_section: 3 }).eq('story_id', bookId).eq('user_id', me).throwOnError();

  const wip = await createFic({
    ao3Link: `https://archiveofourown.org/works/${(parseInt(run, 36) % 1_000_000_000) + 11}`,
    title: 'Ongoing Fic',
    author: 'fic_writer',
    fandom: 'Good Omens',
    ship: 'Aziraphale/Crowley',
    complete: false,
    chapters: 5,
    rating: 'Mature',
    warnings: ['Major Character Death'],
  });
  wipId = wip.id;
  await addToLibrary(wipId, 'currently_reading');
  await supabase.from('library_entries').update({ progress_section: 5 }).eq('story_id', wipId).eq('user_id', me).throwOnError();

  strangerBookId = (await createManualBook({ title: 'Not Yet Mine', author: 'B. Writer', chapters: 4, language: 'en' })).id;
});

async function open(language: Language, storyId: string) {
  await renderScreen(language, { 'story/[id]': StoryScreen }, `/story/${storyId}`);
  await screen.findByTestId('story-title', {}, { timeout: 8000 });
}

describe('a book you are reading', () => {
  it('shows the story and your progress', async () => {
    await open('en', bookId);
    expect(screen.getByTestId('story-title')).toHaveTextContent('Ten Chapters');
    expect(screen.getByText('A. Writer')).toBeOnTheScreen();
    expect(screen.getByText('Finished chapter 3 of 10')).toBeOnTheScreen();
  });

  it('"I finished chapter 4" moves progress on', async () => {
    await open('en', bookId);
    await fireEvent.press(screen.getByText('I finished chapter 4'));
    expect(await screen.findByText('Finished chapter 4 of 10', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect((await entry(bookId)).progress_section).toBe(4);
  });

  it('the chapter picker can move progress back', async () => {
    await open('en', bookId);
    await fireEvent.press(screen.getByText('Change chapter'));
    await fireEvent.press(await screen.findByTestId('chapter-option-2'));
    expect(await screen.findByText('Finished chapter 2 of 10', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect((await entry(bookId)).progress_section).toBe(2);
  });

  it('a page number shows a personal percentage and leaves the chapter alone', async () => {
    await open('en', bookId);
    await fireEvent.changeText(screen.getByLabelText('I’m on page'), '150');
    await fireEvent.press(screen.getByText('Save page'));
    expect(await screen.findByText('50% read', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(await entry(bookId)).toMatchObject({ progress_page: 150, progress_section: 2 });
  });

  it('status and favourite are saved; On Hold is only for fanfiction', async () => {
    await open('en', bookId);
    expect(screen.queryByText('On Hold')).toBeNull();
    await fireEvent.press(screen.getByText('Want to Read'));
    await screen.findByRole('button', { name: 'Want to Read', selected: true }, { timeout: 8000 });
    await fireEvent.press(screen.getByLabelText('Add to favourites'));
    expect(await screen.findByLabelText('Remove from favourites', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(await entry(bookId)).toMatchObject({ status: 'want_to_read', is_favourite: true });
  });

  it('in Bulgarian', async () => {
    await open('bg', bookId);
    expect(screen.getByText('Прочетена глава 2 от 10')).toBeOnTheScreen();
    expect(screen.getByText('Прочетох глава 3')).toBeOnTheScreen();
  });
});

describe('a WIP fic you are caught up with', () => {
  it('shows fic details: fandom, ship, AO3 rating, archive warnings and a link to all tags', async () => {
    await open('en', wipId);
    expect(screen.getByText('Good Omens')).toBeOnTheScreen();
    expect(screen.getByText('Aziraphale/Crowley')).toBeOnTheScreen();
    expect(screen.getByText('Mature')).toBeOnTheScreen();
    expect(screen.getByText('Major character death')).toBeOnTheScreen();
    expect(screen.getByText('All tags on AO3 ↗')).toBeOnTheScreen();
    expect(screen.getByText('WIP')).toBeOnTheScreen();
    expect(screen.getByText('On Hold')).toBeOnTheScreen();
  });

  it('reports a newly published chapter when you finish it', async () => {
    await open('en', wipId);
    await fireEvent.press(screen.getByText('Chapter 6 is out: I finished it'));
    expect(await screen.findByText('Finished chapter 6 of 6', {}, { timeout: 8000 })).toBeOnTheScreen();
    const story = (await supabase.from('stories').select('published_sections').eq('id', wipId).single().throwOnError()).data!;
    expect(story.published_sections).toBe(6);
  });

  it('can be marked complete by a caught-up reader, and set back to ongoing', async () => {
    await open('en', wipId);
    await fireEvent.press(screen.getByText('The fic is complete'));
    expect(await screen.findByText('Complete', {}, { timeout: 8000 })).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Not complete after all? Set it back to ongoing'));
    expect(await screen.findByText('WIP', {}, { timeout: 8000 })).toBeOnTheScreen();
  });
});

describe('a story not in your library', () => {
  it('offers to add it', async () => {
    await open('en', strangerBookId);
    expect(screen.queryByText(/I finished chapter/)).toBeNull();
    await fireEvent.press(screen.getByText('Add to my library'));
    // The page shows the library section once the entry is saved; then check what was saved.
    expect(await screen.findByText('I finished chapter 1', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect((await entry(strangerBookId)).status).toBe('want_to_read');
  });
});

describe('the discussion rooms on a story page', () => {
  let roomsBookId: string;

  function RoomStub() {
    const { room } = useLocalSearchParams<{ room: string }>();
    return <Text>{`room ${room}`}</Text>;
  }

  beforeAll(async () => {
    roomsBookId = (await createManualBook({ title: 'Three Rooms', author: 'C. Writer', chapters: 3, language: 'en' })).id;
    await addToLibrary(roomsBookId, 'currently_reading');
    await supabase.from('library_entries').update({ progress_section: 1 }).eq('story_id', roomsBookId).eq('user_id', me).throwOnError();
  });

  it('lists every chapter and The Epilogue, with what is still locked', async () => {
    await renderScreen('en', { 'story/[id]': StoryScreen, 'room/[storyId]/[room]': RoomStub }, `/story/${roomsBookId}`);
    const ch1 = await screen.findByTestId('room-chapter-1', {}, { timeout: 8000 });
    expect(within(ch1).getByText('Chapter 1')).toBeOnTheScreen();
    expect(within(ch1).getByText('1 reader')).toBeOnTheScreen();
    expect(within(screen.getByTestId('room-chapter-2')).getByText('Finish chapter 2 to open')).toBeOnTheScreen();
    expect(within(screen.getByTestId('room-epilogue')).getByText('The Epilogue')).toBeOnTheScreen();
    expect(within(screen.getByTestId('room-epilogue')).getByText('Opens when you finish')).toBeOnTheScreen();
  });

  it('an unlocked room opens; a locked one does not', async () => {
    await renderScreen('en', { 'story/[id]': StoryScreen, 'room/[storyId]/[room]': RoomStub }, `/story/${roomsBookId}`);
    await fireEvent.press(await screen.findByTestId('room-chapter-2', {}, { timeout: 8000 }));
    expect(screen.queryByText('room 2')).toBeNull();
    await fireEvent.press(screen.getByTestId('room-chapter-1'));
    expect(await screen.findByText('room 1', {}, { timeout: 8000 })).toBeOnTheScreen();
  });
});
