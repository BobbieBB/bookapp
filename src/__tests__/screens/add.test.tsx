import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { AuthProvider } from '../../lib/auth';
import type { Language } from '../../i18n';
import { supabase } from '../../lib/supabase';
import { languageWrapper } from '../../../test/i18n';
import AddStory from '../../../app/add';

// A real reader on the local Supabase stack; Open Library is a local stand-in server.
const password = 'test-password-1234';
const run = Date.now().toString(36);

let server: Server;
let docs: object[] = [];

beforeAll(async () => {
  const email = `adder-${run}@example.test`;
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data.user) throw error ?? new Error('could not sign up');
  const { error: profileError } = await supabase.from('profiles').insert({ id: data.user.id, username: `adder_${run}` });
  if (profileError) throw profileError;

  server = createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ docs }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.EXPO_PUBLIC_OPEN_LIBRARY_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  delete process.env.EXPO_PUBLIC_OPEN_LIBRARY_URL;
  await new Promise((resolve) => server.close(resolve));
  await supabase.auth.signOut();
});

beforeEach(() => {
  docs = [];
});

async function open(language: Language) {
  const Wrapper = await languageWrapper(language);
  await renderRouter(
    { add: AddStory },
    {
      initialUrl: '/add',
      wrapper: ({ children }) => (
        <Wrapper>
          <AuthProvider>{children}</AuthProvider>
        </Wrapper>
      ),
    },
  );
}

const words = {
  en: {
    title: 'Add a story',
    book: 'Book',
    fanfic: 'Fanfiction',
    search: 'Search',
    hobbit: 'The Hobbit',
    pages: '310 pages',
    cantFind: 'Can’t find it?',
    noBooks: 'No books found',
    byHand: 'Add it by hand',
    link: 'AO3 link',
    badLink: 'That doesn’t look like an AO3 work link.',
    chapters: 'Chapters',
    add: 'Add to my library',
    errorChapters: 'Enter the number of chapters (1 to 5000).',
    errorTitle: 'Add the title.',
    statusLabel: 'Add it as',
  },
  bg: {
    title: 'Добави история',
    book: 'Книга',
    fanfic: 'Фенфикшън',
    search: 'Търсене',
    hobbit: 'The Hobbit',
    pages: '310 страници',
    cantFind: 'Не я намираш?',
    noBooks: 'Не намерихме книги',
    byHand: 'Добави я ръчно',
    link: 'Линк към AO3',
    badLink: 'Това не прилича на линк към работа в AO3.',
    chapters: 'Глави',
    add: 'Добави в моята библиотека',
    errorChapters: 'Въведи броя на главите (от 1 до 5000).',
    errorTitle: 'Добави заглавието.',
    statusLabel: 'Добави като',
  },
} as const;

describe.each(['en', 'bg'] as const)('add-story screen in %s', (lang) => {
  const w = words[lang];

  it('shows the title and the book / fanfiction switch', async () => {
    await open(lang);
    expect(await screen.findByText(w.title)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: w.book })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: w.fanfic })).toBeOnTheScreen();
  });

  it('searches Open Library from three letters, then offers the hand-add at the end', async () => {
    docs = [{ key: '/works/OL1W', title: 'The Hobbit', author_name: ['J. R. R. Tolkien'], first_publish_year: 1937, number_of_pages_median: 310 }];
    await open(lang);
    await fireEvent.changeText(await screen.findByLabelText(w.search), 'hob');
    expect(await screen.findByText(new RegExp(w.pages), {}, { timeout: 3000 })).toBeOnTheScreen();
    expect(screen.getAllByText(w.hobbit).length).toBeGreaterThan(0);
    expect(await screen.findByText(w.cantFind)).toBeOnTheScreen();
  });

  it('with no results, "add it by hand" is the card\'s main action', async () => {
    await open(lang);
    await fireEvent.changeText(await screen.findByLabelText(w.search), 'zzzz');
    expect(await screen.findByText(w.noBooks, {}, { timeout: 3000 })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: w.byHand })).toBeOnTheScreen();
  });

  it('flags a link that is not an AO3 work', async () => {
    await open(lang);
    await fireEvent.press(await screen.findByRole('button', { name: w.fanfic }));
    await fireEvent.changeText(await screen.findByLabelText(w.link), 'https://example.com/nope');
    await waitFor(() => expect(screen.getByText(w.badLink)).toBeOnTheScreen());
  });

  it('a new fic: field errors show right under each field, warnings are optional', async () => {
    await open(lang);
    await fireEvent.press(await screen.findByRole('button', { name: w.fanfic }));
    await fireEvent.changeText(await screen.findByLabelText(w.link), `https://archiveofourown.org/works/9${Date.now() % 1e8}`);
    const chapters = await screen.findByLabelText(w.chapters, {}, { timeout: 8000 });
    expect(screen.getByText(w.statusLabel)).toBeOnTheScreen();
    // A wrong chapter count shows at once, without pressing save.
    await fireEvent.changeText(chapters, '86292');
    expect(await screen.findByText(w.errorChapters)).toBeOnTheScreen();
    // Empty required fields show only once the reader tries to save; no error for archive warnings.
    expect(screen.queryByText(w.errorTitle)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: w.add }));
    expect(await screen.findByText(w.errorTitle)).toBeOnTheScreen();
    expect(screen.queryByText(/Pick the archive warnings|Избери предупрежденията/)).toBeNull();
  });
});

it('adding a fic adds its fandom to "Your fandoms"', async () => {
  const fandom = `Followed Fandom ${run}`;
  await open('en');
  await fireEvent.press(await screen.findByRole('button', { name: 'Fanfiction' }));
  await fireEvent.changeText(await screen.findByLabelText('AO3 link'), `https://archiveofourown.org/works/8${Date.now() % 1e8}`);
  await fireEvent.changeText(await screen.findByLabelText('Title', {}, { timeout: 8000 }), 'Followed Fic');
  await fireEvent.changeText(screen.getByLabelText('Author'), 'someone');
  await fireEvent.changeText(screen.getByLabelText('Fandom'), fandom);
  await fireEvent.changeText(screen.getByLabelText('Chapters'), '3');
  await fireEvent.press(screen.getByRole('button', { name: 'Add to my library' }));
  await waitFor(
    async () => {
      const me = (await supabase.auth.getUser()).data.user!.id;
      const { data } = await supabase.from('profiles').select('favourite_fandoms').eq('id', me).single().throwOnError();
      expect(data!.favourite_fandoms).toContain(fandom);
    },
    { timeout: 8000 },
  );
});
