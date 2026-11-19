import { cleanQuery, coverOf, googleParams, mapVolumes } from '../../../supabase/functions/google-books/books';

// The google-books Edge Function's own logic (the Deno entry point only adds the key and calls Google).

describe('cleanQuery', () => {
  it('accepts 3 to 200 characters, trimmed', () => {
    expect(cleanQuery('  Под   игото ')).toBe('Под игото');
    expect(cleanQuery('ab')).toBeNull();
    expect(cleanQuery('x'.repeat(201))).toBeNull();
    expect(cleanQuery(42)).toBeNull();
    expect(cleanQuery(undefined)).toBeNull();
  });
});

describe('googleParams', () => {
  it('limits Cyrillic searches to Bulgarian editions', () => {
    const p = googleParams('Под игото');
    expect(p.get('q')).toBe('Под игото');
    expect(p.get('langRestrict')).toBe('bg');
    expect(p.get('maxResults')).toBe('10');
  });

  it('searches Latin text in every language', () => {
    expect(googleParams('the hobbit').has('langRestrict')).toBe(false);
  });

  it('searches an ISBN as an ISBN', () => {
    const p = googleParams('978-954-0-12345-6');
    expect(p.get('q')).toBe('isbn:9789540123456');
    expect(p.has('langRestrict')).toBe(false);
  });

  it('never carries a key: the function adds it', () => {
    expect(googleParams('Тютюн').has('key')).toBe(false);
  });
});

describe('coverOf', () => {
  it('makes Google cover links https and drops the page-curl effect', () => {
    expect(coverOf('http://books.google.com/books/content?id=abc&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api')).toBe(
      'https://books.google.com/books/content?id=abc&printsec=frontcover&img=1&zoom=1&source=gbs_api',
    );
  });

  it('refuses any other host (the database would too)', () => {
    expect(coverOf('https://evil.example/books/content?id=1')).toBeNull();
    expect(coverOf(undefined)).toBeNull();
  });
});

describe('mapVolumes', () => {
  it('maps volumes and drops ones without a title or an author', () => {
    const body = {
      items: [
        {
          id: 'zyTCAlFPjgYC',
          volumeInfo: {
            title: 'Тютюн',
            authors: ['Димитър Димитров'],
            publishedDate: '2008-05',
            pageCount: 712,
            imageLinks: { thumbnail: 'http://books.google.com/books/content?id=zyTCAlFPjgYC&img=1' },
          },
        },
        { id: 'noauthor', volumeInfo: { title: 'Без автор' } },
        { id: 'notitle', volumeInfo: { authors: ['Някой'] } },
        { volumeInfo: { title: 'No id', authors: ['x'] } },
      ],
    };
    expect(mapVolumes(body)).toEqual([
      {
        key: 'zyTCAlFPjgYC',
        source: 'google_books',
        title: 'Тютюн',
        author: 'Димитър Димитров',
        year: 2008,
        pages: 712,
        coverUrl: 'https://books.google.com/books/content?id=zyTCAlFPjgYC&img=1',
      },
    ]);
  });

  it('copes with an empty or odd answer', () => {
    expect(mapVolumes({})).toEqual([]);
    expect(mapVolumes(null)).toEqual([]);
    expect(mapVolumes({ items: [{ id: 'a', volumeInfo: { title: 'T', authors: ['A'], publishedDate: 'n/a', pageCount: 0 } }] })).toEqual([
      { key: 'a', source: 'google_books', title: 'T', author: 'A', year: null, pages: null, coverUrl: null },
    ]);
  });
});
