import { bareTitle, parseCsv, parseGoodreadsExport, pickMatch, type GoodreadsBook } from '../goodreads';
import type { BookResult } from '../sources';

// Invented books only (no real readers' data). The header is Goodreads' export header.
const HEADER =
  'Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Average Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Bookshelves with positions,Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Owned Copies';
const row = (title: string, author: string, isbn13: string, rating: number, shelf: string, review = '') =>
  `1,"${title}",${author},,,="",="${isbn13}",${rating},4.1,Pub,Paperback,300,2020,2020,,2026/01/01,,,${shelf},"${review}",,,1,0`;

describe('parseCsv', () => {
  it('keeps commas, line breaks and doubled quotes inside quoted fields', () => {
    expect(parseCsv('a,"b, c","say ""hi""\nthere"\r\nd,e,f\n')).toEqual([
      ['a', 'b, c', 'say "hi"\nthere'],
      ['d', 'e', 'f'],
    ]);
  });
});

describe('parseGoodreadsExport', () => {
  const file = [
    HEADER,
    row('The Lantern Keeper (Lanterns, #1)', 'Mira Vale', '9781234567897', 5, 'read', 'Loved it, truly.\nAgain.'),
    row('Paper Wings', 'Ivo Stern', '', 0, 'currently-reading'),
    row('Salt and Ember', 'Ana Dove', '', 3, 'to-read'),
    row('Never Mind', 'Some One', '', 0, 'did-not-finish'),
  ].join('\n');

  it('reads the three shelves, the ISBN, whole stars (0 = none), without the series and without reviews', () => {
    expect(parseGoodreadsExport(file)).toEqual<GoodreadsBook[]>([
      { title: 'The Lantern Keeper', author: 'Mira Vale', isbn: '9781234567897', shelf: 'read', rating: 5 },
      { title: 'Paper Wings', author: 'Ivo Stern', isbn: null, shelf: 'currently-reading', rating: null },
      { title: 'Salt and Ember', author: 'Ana Dove', isbn: null, shelf: 'to-read', rating: 3 },
    ]);
  });

  it('refuses a file that is not a Goodreads export', () => {
    expect(() => parseGoodreadsExport('name,email\nx,y')).toThrow('not a Goodreads export');
  });
});

describe('bareTitle', () => {
  it('drops a trailing series, keeps other brackets', () => {
    expect(bareTitle('The Two Lamps (Lamps, #2)')).toBe('The Two Lamps');
    expect(bareTitle('Tales (Collected)')).toBe('Tales (Collected)');
  });
});

describe('pickMatch', () => {
  const book: GoodreadsBook = { title: 'The Lantern Keeper', author: 'M. Vale', isbn: null, shelf: 'read', rating: null };
  const r = (title: string, author: string): BookResult => ({ key: title, source: 'open_library', title, author, year: null, pages: null, coverUrl: null });

  it('by title: the result with the same title and author, not just the first', () => {
    expect(pickMatch(book, [r('Lantern Craft', 'M. Vale'), r('The Lantern Keeper', 'Mira Vale')], false)?.title).toBe('The Lantern Keeper');
  });

  it('by title: nothing when no result is that book', () => {
    expect(pickMatch(book, [r('The Lantern Keeper', 'Someone Else')], false)).toBeNull();
  });

  it('by ISBN: the first result', () => {
    expect(pickMatch(book, [r('Anything', 'Anyone')], true)?.title).toBe('Anything');
  });
});
