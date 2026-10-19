import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { Language } from '../../i18n';
import * as analytics from '../../lib/analytics';
import { supabase } from '../../lib/supabase';
import { renderScreen } from '../../../test/router';
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
  await renderScreen(language, { add: AddStory }, '/add');
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
    link: 'Връзка към AO3',
    badLink: 'Това не прилича на връзка към работа в AO3.',
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
});

// story_added carries the edition language, for the PO's "BG vs EN" number (docs/DECISIONS.md, Analytics).
describe('the story_added event', () => {
  let tracked: jest.SpyInstance;
  beforeEach(() => {
    tracked = jest.spyOn(analytics, 'track');
  });
  afterEach(() => {
    tracked.mockRestore();
  });

  it('says which language a book added by hand is read in', async () => {
    await open('en');
    await fireEvent.changeText(await screen.findByLabelText('Search'), 'zzzz');
    await fireEvent.press(await screen.findByRole('button', { name: 'Add it by hand' }, { timeout: 3000 }));
    await fireEvent.changeText(screen.getByLabelText('Title'), `Hand Book ${run}`);
    await fireEvent.changeText(screen.getByLabelText('Author'), 'Someone');
    await fireEvent.changeText(screen.getByLabelText('Chapters'), '12');
    await fireEvent.press(screen.getByRole('button', { name: 'Bulgarian' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Add to my library' }));
    await waitFor(() =>
      expect(tracked).toHaveBeenCalledWith('story_added', { kind: 'book', source: 'manual', status: 'currently_reading', language: 'bg' }),
    );
  });

  it('says which language a book found by search is read in', async () => {
    docs = [{ key: `/works/OL${run}W`, title: `Found Book ${run}`, author_name: ['Someone'], first_publish_year: 2001 }];
    await open('en');
    await fireEvent.changeText(await screen.findByLabelText('Search'), 'found');
    await fireEvent.press(await screen.findByRole('button', { name: 'Add' }, { timeout: 3000 }));
    await fireEvent.press(await screen.findByRole('button', { name: 'English' }));
    await fireEvent.changeText(await screen.findByLabelText('Chapters'), '9');
    await fireEvent.press(screen.getByRole('button', { name: 'Add to my library' }));
    await waitFor(() =>
      expect(tracked).toHaveBeenCalledWith('story_added', { kind: 'book', source: 'open_library', status: 'currently_reading', language: 'en' }),
    );
  });
});
