import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { Linking } from 'react-native';

import Profile from '../../../app/(tabs)/profile';
import FinishedScreen from '../../../app/finished/[id]';
import RoomScreen from '../../../app/room/[storyId]/[room]';
import StoryScreen from '../../../app/story/[id]';
import { setAdmin, sql } from '../../../test/database';
import { renderScreen } from '../../../test/router';
import type { Language } from '../../i18n';
import { addToLibrary, createFic } from '../../lib/stories';
import { supabase } from '../../lib/supabase';

// Explicit works (docs/DECISIONS.md, "Explicit works: an 18+ confirmation"): the minimum age is 16, so
// the first time a reader opens the AO3 link or a discussion room of a work rated Explicit, a dialog asks
// whether they are 18 or over. The answer is kept on the account, so it is asked once. Nothing else is
// hidden: the story shows its rating, warnings and link as before. Mature and the other ratings never ask.
const password = 'test-password-1234';
const run = Date.now().toString(36);
const TITLE = 'Explicit content';
const BODY = 'This work is rated Explicit on AO3, and its discussion may include adult content.';
const CONTINUE = 'I’m 18 or over, continue';
const FAILED = 'Could not save your answer. Please try again.';
const LINK = 'All tags on AO3 ↗';
let me = '';
let explicitId = '';
let explicitUrl = '';
let matureId = '';
let matureUrl = '';
let n = 0;

async function fic(rating: 'Explicit' | 'Mature', warnings: string[]) {
  const ao3Link = `https://archiveofourown.org/works/${(parseInt(run, 36) % 1_000_000_000) + 1800 + n++}`;
  const story = await createFic({
    ao3Link,
    title: `${rating} Fic`,
    author: 'gate_writer',
    fandom: 'Good Omens',
    ship: '',
    complete: true,
    chapters: 3,
    rating,
    warnings,
  });
  await addToLibrary(story.id, 'finished');
  return { id: story.id, url: ao3Link };
}

// The answer is private: the reader reads it through my_profile(), like the other private columns.
const confirmed = async () =>
  (await supabase.rpc('my_profile').select('adult_confirmed').single().throwOnError()).data!.adult_confirmed as boolean;

const dialog = () => screen.getByTestId('explicit-dialog');

// A new reader who has not answered yet, with the Explicit fic finished (every room reached).
async function freshReader(tag: string) {
  await supabase.auth.signOut();
  const { data, error } = await supabase.auth.signUp({ email: `${tag}-${run}@example.test`, password });
  if (error || !data.user) throw error ?? new Error('could not sign up');
  await supabase.from('profiles').insert({ id: data.user.id, username: `${tag}_${run}` }).throwOnError();
  await addToLibrary(explicitId, 'finished');
}

beforeAll(async () => {
  const { data, error } = await supabase.auth.signUp({ email: `gate-${run}@example.test`, password });
  if (error || !data.user) throw error ?? new Error('could not sign up');
  me = data.user.id;
  await supabase.from('profiles').insert({ id: me, username: `gate_${run}` }).throwOnError();
  ({ id: explicitId, url: explicitUrl } = await fic('Explicit', ['Graphic Depictions Of Violence']));
  ({ id: matureId, url: matureUrl } = await fic('Mature', ['Major Character Death']));
});

afterAll(async () => {
  await supabase.auth.signOut();
});

let open: jest.SpyInstance;
beforeEach(() => {
  open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
});
afterEach(() => {
  open.mockRestore();
});

async function openStory(id: string, language: Language = 'en') {
  await renderScreen(language, { 'story/[id]': StoryScreen, 'room/[storyId]/[room]': RoomScreen }, `/story/${id}`);
  await screen.findByTestId('story-title', {}, { timeout: 8000 });
}

async function openFinished(id: string) {
  await renderScreen('en', { 'finished/[id]': FinishedScreen, 'story/[id]': StoryScreen, 'room/[storyId]/[room]': RoomScreen }, `/finished/${id}`);
  await screen.findByText('You finished it!', {}, { timeout: 8000 });
}

async function openRoom(id: string, room: string) {
  await renderScreen('en', { 'room/[storyId]/[room]': RoomScreen, 'story/[id]': StoryScreen }, `/room/${id}/${room}`);
  await screen.findByTestId('room-title', {}, { timeout: 20_000 });
}

describe('a reader who has not said they are 18 or over', () => {
  it('starts unconfirmed, and Profile has no 18+ switch', async () => {
    expect(await confirmed()).toBe(false);
    await renderScreen('en', { profile: Profile }, '/profile');
    await screen.findByText('Help us improve the app', {}, { timeout: 8000 });
    expect(screen.queryByText('I’m 18 or over')).toBeNull();
    expect(screen.queryByText('Shows links to works rated Explicit on AO3.')).toBeNull();
  });

  it('an Explicit fic shows its rating, archive warnings and AO3 link as before', async () => {
    await openStory(explicitId);
    expect(await screen.findByText('All tags on AO3 ↗', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.getByText('Explicit')).toBeOnTheScreen();
    expect(screen.getByText('Graphic violence')).toBeOnTheScreen();
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('opening the AO3 link of an Explicit fic asks first; Back opens nothing and stays', async () => {
    await openStory(explicitId);
    await fireEvent.press(await screen.findByText('All tags on AO3 ↗', {}, { timeout: 8000 }));
    expect(within(dialog()).getByText(TITLE)).toBeOnTheScreen();
    expect(within(dialog()).getByText(BODY)).toBeOnTheScreen();
    expect(within(dialog()).getByText(CONTINUE)).toBeOnTheScreen();
    await fireEvent.press(within(dialog()).getByText('Back'));
    await waitFor(() => expect(screen.queryByTestId('explicit-dialog')).toBeNull());
    expect(screen.getByTestId('story-title')).toBeOnTheScreen();
    expect(open).not.toHaveBeenCalled();
    expect(await confirmed()).toBe(false);
  });

  it('a Mature fic\'s link opens without asking', async () => {
    await openStory(matureId);
    await fireEvent.press(await screen.findByText('All tags on AO3 ↗', {}, { timeout: 8000 }));
    expect(open).toHaveBeenCalledWith(matureUrl);
    expect(screen.queryByTestId('explicit-dialog')).toBeNull();
  });

  it('entering an Explicit fic\'s room from the story asks first; Back stays on the story', async () => {
    await openStory(explicitId);
    const room = await screen.findByTestId('room-chapter-1', {}, { timeout: 8000 });
    expect(room).toBeEnabled();
    await fireEvent.press(room);
    expect(await screen.findByTestId('explicit-dialog', {}, { timeout: 8000 })).toBeOnTheScreen();
    await fireEvent.press(within(dialog()).getByText('Back'));
    await waitFor(() => expect(screen.queryByTestId('explicit-dialog')).toBeNull());
    expect(screen.getByTestId('story-title')).toBeOnTheScreen();
    expect(screen.queryByTestId('room-title')).toBeNull();
    expect(await confirmed()).toBe(false);
  });

  it('"You finished it!": Open on AO3 and The Epilogue ask first for an Explicit fic, not for a Mature one', async () => {
    await openFinished(explicitId);
    await fireEvent.press(screen.getByText('Open on AO3 ↗'));
    expect(within(dialog()).getByText(TITLE)).toBeOnTheScreen();
    await fireEvent.press(within(dialog()).getByText('Back'));
    await waitFor(() => expect(screen.queryByTestId('explicit-dialog')).toBeNull());
    await fireEvent.press(screen.getByText('Join The Epilogue'));
    expect(within(dialog()).getByText(TITLE)).toBeOnTheScreen();
    await fireEvent.press(within(dialog()).getByText('Back'));
    await waitFor(() => expect(screen.queryByTestId('explicit-dialog')).toBeNull());
    expect(screen.getByText('You finished it!')).toBeOnTheScreen();
    expect(open).not.toHaveBeenCalled();

    await openFinished(matureId);
    await fireEvent.press(screen.getByText('Open on AO3 ↗'));
    expect(open).toHaveBeenCalledWith(matureUrl);
    expect(screen.queryByTestId('explicit-dialog')).toBeNull();
  });

  it('an Explicit fic\'s room reached directly (a link) asks before showing the discussion; Back leaves it', async () => {
    await openRoom(explicitId, 'epilogue');
    expect(await screen.findByTestId('explicit-dialog', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.queryByLabelText('Write a comment…')).toBeNull();
    await fireEvent.press(within(dialog()).getByText('Back'));
    expect(await screen.findByTestId('story-title', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(await confirmed()).toBe(false);
  });

  it('a Mature fic\'s room opens without asking', async () => {
    await openRoom(matureId, '1');
    expect(await screen.findByLabelText('Write a comment…', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.queryByTestId('explicit-dialog')).toBeNull();
  });

  it('in Bulgarian', async () => {
    await openStory(explicitId, 'bg');
    await fireEvent.press(await screen.findByText('Всички тагове в AO3 ↗', {}, { timeout: 8000 }));
    expect(within(dialog()).getByText('Explicit съдържание')).toBeOnTheScreen();
    expect(
      within(dialog()).getByText('Тази творба е с рейтинг Explicit в AO3 и обсъждането може да съдържа съдържание за възрастни.'),
    ).toBeOnTheScreen();
    expect(within(dialog()).getByText('Аз съм на 18+, продължи')).toBeOnTheScreen();
    await fireEvent.press(within(dialog()).getByText('Назад'));
    await waitFor(() => expect(screen.queryByTestId('explicit-dialog')).toBeNull());
    expect(open).not.toHaveBeenCalled();
  });
});

describe('an admin who has not said they are 18 or over', () => {
  it('enters an Explicit fic\'s room without the dialog, to moderate it (the server lets admins in)', async () => {
    expect(await confirmed()).toBe(false);
    setAdmin(me, true);
    try {
      await openRoom(explicitId, '1');
      expect(await screen.findByLabelText('Write a comment…', {}, { timeout: 8000 })).toBeOnTheScreen();
      expect(screen.queryByTestId('explicit-dialog')).toBeNull();
    } finally {
      setAdmin(me, false);
    }
  });
});

describe('saying yes', () => {
  it('Continue records the answer on the account and enters the room', async () => {
    await openStory(explicitId);
    await fireEvent.press(await screen.findByTestId('room-chapter-1', {}, { timeout: 8000 }));
    await fireEvent.press(within(dialog()).getByText(CONTINUE));
    await fireEvent.changeText(await screen.findByLabelText('Write a comment…', {}, { timeout: 8000 }), 'Old enough to talk about it');
    expect(screen.queryByTestId('explicit-dialog')).toBeNull();
    expect(await confirmed()).toBe(true);
    await fireEvent.press(screen.getByText('Post'));
    expect(await screen.findByText('Old enough to talk about it', {}, { timeout: 8000 })).toBeOnTheScreen();
  });

  it('is asked only once: the link, Open on AO3 and the rooms go straight through afterwards', async () => {
    await openStory(explicitId);
    await fireEvent.press(await screen.findByText('All tags on AO3 ↗', {}, { timeout: 8000 }));
    await waitFor(() => expect(open).toHaveBeenCalledWith(explicitUrl), { timeout: 8000 });
    expect(screen.queryByTestId('explicit-dialog')).toBeNull();

    await openFinished(explicitId);
    await fireEvent.press(screen.getByText('Open on AO3 ↗'));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(2), { timeout: 8000 });
    expect(screen.queryByTestId('explicit-dialog')).toBeNull();

    await openRoom(explicitId, 'epilogue');
    expect(await screen.findByLabelText('Write a comment…', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.queryByTestId('explicit-dialog')).toBeNull();
  });

  it('Continue from the AO3 link opens the link (a fresh reader)', async () => {
    await freshReader('gate2');
    await openStory(explicitId);
    await fireEvent.press(await screen.findByText('All tags on AO3 ↗', {}, { timeout: 8000 }));
    await fireEvent.press(within(dialog()).getByText(CONTINUE));
    await waitFor(() => expect(open).toHaveBeenCalledWith(explicitUrl), { timeout: 8000 });
    expect(screen.queryByTestId('explicit-dialog')).toBeNull();
    expect(await confirmed()).toBe(true);
  });
});

describe('the dialog, when things go wrong', () => {
  it('a double tap on Continue opens the link once', async () => {
    await freshReader('gate3');
    await openStory(explicitId);
    await fireEvent.press(await screen.findByText(LINK, {}, { timeout: 8000 }));
    const go = within(dialog()).getByText(CONTINUE);
    // Both taps land before the dialog re-renders as saving (one act: nothing renders in between).
    await act(async () => {
      void fireEvent.press(go);
      void fireEvent.press(go);
    });
    await waitFor(() => expect(open).toHaveBeenCalledWith(explicitUrl), { timeout: 8000 });
    await waitFor(() => expect(screen.queryByTestId('explicit-dialog')).toBeNull());
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('when the answer cannot be saved, the dialog says so, nothing opens and Continue can be tried again', async () => {
    await freshReader('gate4');
    await openStory(explicitId);
    await fireEvent.press(await screen.findByText(LINK, {}, { timeout: 8000 }));
    // The server refuses the real call: confirm_adult() is revoked from readers for the length of the tap.
    sql('revoke execute on function public.confirm_adult() from authenticated;');
    try {
      await fireEvent.press(within(dialog()).getByText(CONTINUE));
      expect(await within(dialog()).findByText(FAILED, {}, { timeout: 8000 })).toBeOnTheScreen();
    } finally {
      sql('grant execute on function public.confirm_adult() to authenticated;');
    }
    expect(within(dialog()).getByText(CONTINUE)).toBeOnTheScreen();
    expect(open).not.toHaveBeenCalled();
    expect(await confirmed()).toBe(false);
  });

  it('a yes given at the AO3 link shows the rooms\' comment counts on the same story screen', async () => {
    await freshReader('gate5');
    await openStory(explicitId);
    const row = await screen.findByTestId('room-chapter-1', {}, { timeout: 8000 });
    // The first reader's comment (saying yes, above) is hidden behind the question until now.
    expect(within(row).queryByLabelText(/comment/)).toBeNull();
    await fireEvent.press(screen.getByText(LINK));
    await fireEvent.press(within(dialog()).getByText(CONTINUE));
    await waitFor(() => expect(open).toHaveBeenCalledWith(explicitUrl), { timeout: 8000 });
    expect(await within(screen.getByTestId('room-chapter-1')).findByLabelText(/1 comment/, {}, { timeout: 8000 })).toBeOnTheScreen();
  });
});
