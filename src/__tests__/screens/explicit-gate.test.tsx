import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import Profile from '../../../app/(tabs)/profile';
import FinishedScreen from '../../../app/finished/[id]';
import StoryScreen from '../../../app/story/[id]';
import { renderScreen } from '../../../test/router';
import type { Language } from '../../i18n';
import { addToLibrary, createFic } from '../../lib/stories';
import { supabase } from '../../lib/supabase';

// Explicit works behind an 18+ yes/no (docs/DECISIONS.md, "Explicit works: an 18+ yes/no"): the
// minimum age is 16, so until a reader says they are 18 or over, a fic rated Explicit shows its
// rating but not its AO3 link or its archive warnings. Mature and the other ratings are unaffected.
const password = 'test-password-1234';
const run = Date.now().toString(36);
const GATE = 'Rated Explicit on AO3. Confirm you’re 18 or over in Profile to see the link.';
let me = '';
let explicitId = '';
let matureId = '';
let n = 0;

async function fic(rating: 'Explicit' | 'Mature', warnings: string[]) {
  const story = await createFic({
    ao3Link: `https://archiveofourown.org/works/${(parseInt(run, 36) % 1_000_000_000) + 1800 + n++}`,
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
  return story.id;
}

const confirmed = async () =>
  (await supabase.from('profiles').select('adult_confirmed').eq('id', me).single().throwOnError()).data!.adult_confirmed as boolean;

beforeAll(async () => {
  const { data, error } = await supabase.auth.signUp({ email: `gate-${run}@example.test`, password });
  if (error || !data.user) throw error ?? new Error('could not sign up');
  me = data.user.id;
  await supabase.from('profiles').insert({ id: me, username: `gate_${run}` }).throwOnError();
  explicitId = await fic('Explicit', ['Graphic Depictions Of Violence']);
  matureId = await fic('Mature', ['Major Character Death']);
});

afterAll(async () => {
  await supabase.auth.signOut();
});

async function openStory(id: string, language: Language = 'en') {
  await renderScreen(language, { 'story/[id]': StoryScreen }, `/story/${id}`);
  await screen.findByTestId('story-title', {}, { timeout: 8000 });
}

async function openFinished(id: string) {
  await renderScreen('en', { 'finished/[id]': FinishedScreen, 'story/[id]': StoryScreen }, `/finished/${id}`);
  await screen.findByText('You finished it!', {}, { timeout: 8000 });
}

async function setSwitch(on: boolean) {
  await renderScreen('en', { profile: Profile }, '/profile');
  const toggle = await screen.findByLabelText('I’m 18 or over', {}, { timeout: 8000 });
  expect(screen.getByText('Shows links to works rated Explicit on AO3.')).toBeOnTheScreen();
  await waitFor(() => expect(toggle.props.value).toBe(!on), { timeout: 8000 });
  await fireEvent(toggle, 'valueChange', on);
  await waitFor(async () => expect(await confirmed()).toBe(on), { timeout: 8000 });
  await waitFor(() => expect(screen.getByLabelText('I’m 18 or over').props.value).toBe(on), { timeout: 8000 });
}

describe('a reader who has not said they are 18 or over', () => {
  it('starts unconfirmed', async () => {
    expect(await confirmed()).toBe(false);
  });

  it('an Explicit fic keeps its rating but hides the AO3 link and the archive warnings', async () => {
    await openStory(explicitId);
    await waitFor(() => expect(screen.getByText(GATE)).toBeOnTheScreen(), { timeout: 8000 });
    expect(screen.getByText('Explicit')).toBeOnTheScreen();
    expect(screen.queryByText('Graphic violence')).toBeNull();
    expect(screen.queryByText('All tags on AO3 ↗')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('a Mature fic is unaffected', async () => {
    await openStory(matureId);
    expect(await screen.findByText('All tags on AO3 ↗', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.getByText('Mature')).toBeOnTheScreen();
    expect(screen.getByText('Major character death')).toBeOnTheScreen();
    expect(screen.queryByText(GATE)).toBeNull();
  });

  it('"You finished it!" has no AO3 button for an Explicit fic, and keeps it for a Mature one', async () => {
    await openFinished(explicitId);
    expect(screen.getByText(GATE)).toBeOnTheScreen();
    expect(screen.queryByText('Open on AO3 ↗')).toBeNull();
    await openFinished(matureId);
    expect(screen.getByText('Open on AO3 ↗')).toBeOnTheScreen();
    expect(screen.queryByText(GATE)).toBeNull();
  });

  it('in Bulgarian', async () => {
    await openStory(explicitId, 'bg');
    expect(
      await screen.findByText('Рейтинг „Експлицитно“ в AO3. Потвърди в Профил, че си на 18 или повече, за да видиш линка.', {}, { timeout: 8000 }),
    ).toBeOnTheScreen();
    await renderScreen('bg', { profile: Profile }, '/profile');
    expect(await screen.findByLabelText('На 18 или повече съм', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.getByText('Показва линковете към работи с рейтинг „Експлицитно“ в AO3.')).toBeOnTheScreen();
  });
});

describe('the switch in Profile', () => {
  it('turning it on shows the link and warnings; turning it off hides them again', async () => {
    await setSwitch(true);

    await openStory(explicitId);
    expect(await screen.findByText('All tags on AO3 ↗', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.getByText('Graphic violence')).toBeOnTheScreen();
    expect(screen.getByText('Explicit')).toBeOnTheScreen();
    expect(screen.queryByText(GATE)).toBeNull();
    await openFinished(explicitId);
    expect(screen.getByText('Open on AO3 ↗')).toBeOnTheScreen();

    await setSwitch(false);
    await openStory(explicitId);
    await waitFor(() => expect(screen.getByText(GATE)).toBeOnTheScreen(), { timeout: 8000 });
    expect(screen.queryByText('All tags on AO3 ↗')).toBeNull();
    expect(screen.queryByText('Graphic violence')).toBeNull();
  });
});
