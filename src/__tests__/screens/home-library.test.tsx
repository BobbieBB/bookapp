import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactElement } from 'react';

import Home from '../../../app/(tabs)/index';
import Library from '../../../app/(tabs)/library';
import { languageWrapper } from '../../../test/i18n';
import type { Language } from '../../i18n';
import { AuthProvider } from '../../lib/auth';
import { addToLibrary, createBook, createFic } from '../../lib/stories';
import { supabase } from '../../lib/supabase';

// A real reader in the local Supabase stack with a 10-chapter book in progress (chapter 3 done),
// a 60-page book split into 25-page parts, and a fic on hold.
const password = 'test-password-1234';
const run = Date.now().toString(36);
const email = `screens-${run}@example.test`;
const username = `screens_${run}`;

beforeAll(async () => {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data.user) throw error ?? new Error('could not sign up');
  const { error: profileError } = await supabase.from('profiles').insert({ id: data.user.id, username });
  if (profileError) throw profileError;

  const book = (key: string, title: string) => ({
    key: `/works/OL${run}${key}W`,
    title,
    author: 'An Author',
    year: 2000,
    pages: 60,
    coverUrl: null,
  });
  const chaptered = await createBook(book('A', 'Chaptered'), { chapters: 10 }, 'en');
  await addToLibrary(chaptered.id, 'currently_reading');
  await supabase.from('library_entries').update({ progress_section: 3 }).eq('story_id', chaptered.id).throwOnError();

  const paged = await createBook(book('B', 'Paged'), { pages: 60 }, 'en');
  await addToLibrary(paged.id, 'currently_reading');
  await supabase.from('library_entries').update({ progress_page: 30 }).eq('story_id', paged.id).throwOnError();

  const fic = await createFic({
    ao3Link: `https://archiveofourown.org/works/${parseInt(run, 36) % 1_000_000_000}`,
    title: 'Held fic',
    author: 'someone',
    fandom: 'Some Fandom',
    ship: '',
    complete: false,
    chapters: 3,
    rating: 'General Audiences',
    warnings: [],
  });
  await addToLibrary(fic.id, 'on_hold');
});

async function renderScreen(language: Language, Screen: () => ReactElement) {
  const InLanguage = await languageWrapper(language);
  await renderRouter(
    { index: Screen },
    {
      wrapper: ({ children }: { children: ReactElement }) => (
        <InLanguage>
          <AuthProvider>{children}</AuthProvider>
        </InLanguage>
      ),
    },
  );
}

describe('Home', () => {
  it('in English', async () => {
    await renderScreen('en', Home);
    expect(await screen.findAllByText('Chaptered', {}, { timeout: 8000 })).not.toHaveLength(0);
    expect(screen.getByText('REPLIES TO YOU')).toBeOnTheScreen();
    expect(screen.getByText('CONTINUE READING · BOOKS')).toBeOnTheScreen();
    expect(screen.getByText('Finished chapter 3 of 10')).toBeOnTheScreen();
    expect(screen.getByText('Finished part 1 of 3')).toBeOnTheScreen();
    expect(screen.getByText(`Hi, ${username}`)).toBeOnTheScreen();
    expect(screen.getByText('When someone replies to you or mentions you, you’ll see it here.')).toBeOnTheScreen();
  });

  it('in Bulgarian', async () => {
    await renderScreen('bg', Home);
    expect(await screen.findAllByText('Chaptered', {}, { timeout: 8000 })).not.toHaveLength(0);
    expect(screen.getByText('ОТГОВОРИ ЗА ТЕБ')).toBeOnTheScreen();
    expect(screen.getByText('ПРОДЪЛЖИ ДА ЧЕТЕШ · КНИГИ')).toBeOnTheScreen();
    expect(screen.getByText('Прочетена глава 3 от 10')).toBeOnTheScreen();
    expect(screen.getByText('Прочетена част 1 от 3')).toBeOnTheScreen();
    expect(screen.getByText(`Здравей, ${username}`)).toBeOnTheScreen();
    expect(screen.queryByText('REPLIES TO YOU')).toBeNull();
  });
});

describe('Library', () => {
  it('in English: title, kinds, status chips, progress, fic list', async () => {
    await renderScreen('en', Library);
    expect(await screen.findAllByText('Chaptered', {}, { timeout: 8000 })).not.toHaveLength(0);
    expect(screen.getByText('My Library')).toBeOnTheScreen();
    for (const chip of ['Books', 'Fanfiction', 'All', 'Currently Reading', 'Want to Read', 'Finished', 'DNF']) {
      expect(screen.getByRole('button', { name: chip })).toBeOnTheScreen();
    }
    expect(screen.queryByRole('button', { name: 'On Hold' })).toBeNull();
    expect(screen.getByText('Currently Reading · Finished chapter 3 of 10')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Fanfiction' }));
    expect(screen.getByRole('button', { name: 'On Hold' })).toBeOnTheScreen();
    await waitFor(() => expect(screen.getAllByText('Held fic')).not.toHaveLength(0));
  });

  it('in Bulgarian: title, kinds, status chips, progress, fic list', async () => {
    await renderScreen('bg', Library);
    expect(await screen.findAllByText('Chaptered', {}, { timeout: 8000 })).not.toHaveLength(0);
    expect(screen.getByText('Моята библиотека')).toBeOnTheScreen();
    for (const chip of ['Книги', 'Фенфикшън', 'Всички', 'Чета в момента', 'Искам да прочета', 'Прочетено', 'Недочетено']) {
      expect(screen.getByRole('button', { name: chip })).toBeOnTheScreen();
    }
    expect(screen.queryByRole('button', { name: 'На пауза' })).toBeNull();
    expect(screen.getByText('Чета в момента · Прочетена глава 3 от 10')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Фенфикшън' }));
    expect(screen.getByRole('button', { name: 'На пауза' })).toBeOnTheScreen();
    await waitFor(() => expect(screen.getAllByText('Held fic')).not.toHaveLength(0));
  });
});
