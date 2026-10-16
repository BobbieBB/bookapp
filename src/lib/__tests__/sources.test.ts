import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { guessLanguage, isbnOf, normaliseAo3Link, searchBooks, searchDelay } from '../sources';

describe('normaliseAo3Link', () => {
  it.each([
    ['https://archiveofourown.org/works/123', '123'],
    ['http://www.archiveofourown.org/works/123/chapters/456', '123'],
    ['archiveofourown.org/works/123?view_full_work=true', '123'],
    ['https://ao3.org/works/9#main', '9'],
    ['https://archiveofourown.org/collections/fluff/works/77', '77'],
    ['  HTTPS://ArchiveOfOurOwn.org/works/5  ', '5'],
  ])('%s → work %s', (input, id) => {
    expect(normaliseAo3Link(input)).toBe(`https://archiveofourown.org/works/${id}`);
  });

  it.each([
    '',
    'https://archiveofourown.org/users/someone',
    'https://archiveofourown.org/works/',
    'https://archiveofourown.org.evil.example/works/1',
    'https://evil.example/archiveofourown.org/works/1',
    'https://fanfiction.net/s/123',
    'javascript:alert(1)//archiveofourown.org/works/1',
  ])('rejects %p', (input) => {
    expect(normaliseAo3Link(input)).toBeNull();
  });
});

describe('isbnOf', () => {
  it('accepts ISBN-10 and ISBN-13 with hyphens and spaces', () => {
    expect(isbnOf('0-306-40615-2')).toBe('0306406152');
    expect(isbnOf('978 0 306 40615 7')).toBe('9780306406157');
    expect(isbnOf('080442957x')).toBe('080442957X');
  });

  it('rejects anything else', () => {
    expect(isbnOf('12345')).toBeNull();
    expect(isbnOf('The Hobbit')).toBeNull();
    expect(isbnOf('97803064061577')).toBeNull();
  });
});

// docs/DECISIONS.md, "Search-as-you-type": from 3 characters, after ~350 ms; a pasted ISBN at once.
describe('searchDelay', () => {
  it('does not search below 3 characters', () => {
    expect(searchDelay('')).toBeNull();
    expect(searchDelay('  ab  ')).toBeNull();
  });

  it('waits for a pause in typing', () => {
    expect(searchDelay('hob')).toBe(350);
  });

  it('searches a pasted ISBN immediately', () => {
    expect(searchDelay('978-0-306-40615-7')).toBe(0);
  });
});

describe('guessLanguage', () => {
  it('guesses Bulgarian from Cyrillic titles, English otherwise', () => {
    expect(guessLanguage('Под игото')).toBe('bg');
    expect(guessLanguage('The Hobbit')).toBe('en');
    expect(guessLanguage('')).toBe('en');
  });
});

// A stand-in for openlibrary.org on localhost: we never send test traffic to the volunteer-run API.
describe('searchBooks', () => {
  let server: Server;
  let last: { url: string; headers: IncomingHttpHeaders };
  let reply: { status: number; body: unknown };

  beforeAll(async () => {
    server = createServer((req, res) => {
      last = { url: req.url ?? '', headers: req.headers };
      res.writeHead(reply.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(reply.body));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    process.env.EXPO_PUBLIC_OPEN_LIBRARY_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    delete process.env.EXPO_PUBLIC_OPEN_LIBRARY_URL;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    reply = { status: 200, body: { docs: [] } };
  });

  it('identifies the app to Open Library and asks for at most 10 results', async () => {
    await searchBooks('the hobbit');
    expect(last.headers['user-agent']).toBe('Fictionally/0.1.0 (https://github.com/BobbieBB/bookapp)');
    const params = new URL(last.url, 'http://x').searchParams;
    expect(params.get('q')).toBe('the hobbit');
    expect(params.get('limit')).toBe('10');
  });

  it('searches by ISBN when the text is one', async () => {
    await searchBooks('978-0-306-40615-7');
    const params = new URL(last.url, 'http://x').searchParams;
    expect(params.get('isbn')).toBe('9780306406157');
    expect(params.has('q')).toBe(false);
  });

  it('maps results and drops ones without a title or author', async () => {
    reply.body = {
      docs: [
        { key: '/works/OL1W', title: 'The Hobbit', author_name: ['J. R. R. Tolkien'], first_publish_year: 1937, number_of_pages_median: 310, cover_i: 42 },
        { key: '/works/OL2W', title: 'No author' },
        { key: '/works/OL3W', author_name: ['No title'] },
      ],
    };
    expect(await searchBooks('hobbit')).toEqual([
      {
        key: '/works/OL1W',
        title: 'The Hobbit',
        author: 'J. R. R. Tolkien',
        year: 1937,
        pages: 310,
        coverUrl: 'https://covers.openlibrary.org/b/id/42-M.jpg',
      },
    ]);
  });

  it('fails loudly when Open Library errors', async () => {
    reply = { status: 503, body: {} };
    await expect(searchBooks('hobbit')).rejects.toThrow('Open Library search failed (503)');
  });
});
