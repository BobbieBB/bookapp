import { openLibraryChapterCount, tocChapterCount } from '../chapterSuggestions';

// Invented books only.
describe('tocChapterCount', () => {
  it('counts "Chapter N" entries when there are any, whatever else is listed', () => {
    expect(tocChapterCount([{ title: 'Part One' }, { title: 'Chapter 1' }, { title: 'Chapter 2' }, { title: 'Interlude' }, { title: 'Chapter 3' }])).toBe(3);
    expect(tocChapterCount(['Глава първа', 'Глава втора', 'Глава трета', 'Глава четвърта'])).toBe(4);
  });

  it('otherwise the top level without front and back matter, prologue or epilogue', () => {
    expect(
      tocChapterCount([
        { level: 0, title: 'Contents' },
        { level: 0, title: 'Prologue' },
        { level: 0, title: 'The Lantern' },
        { level: 1, title: 'a scene' },
        { level: 0, title: 'The Door' },
        { level: 0, title: 'The Sea' },
        { level: 0, title: 'Epilogue' },
        { level: 0, title: 'Acknowledgments' },
        { level: 0, title: 'About the Author' },
      ]),
    ).toBe(3);
  });

  it('says nothing for a short or empty list', () => {
    expect(tocChapterCount(undefined)).toBeNull();
    expect(tocChapterCount(['One', 'Two'])).toBeNull();
  });
});

describe('openLibraryChapterCount', () => {
  const reply = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

  it('finds the work by title and author, then takes the most common count among its editions', async () => {
    const urls: string[] = [];
    const get = (url: string) => {
      urls.push(url);
      if (url.includes('/search.json')) {
        return reply({ docs: [{ key: '/works/OL9W', title: 'Lantern Craft', author_name: ['Mira Vale'] }, { key: '/works/OL1W', title: 'The Lantern Keeper', author_name: ['Mira Vale'] }] });
      }
      const toc = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `Chapter ${i + 1}` }));
      return reply({ entries: [{ table_of_contents: toc(22) }, {}, { table_of_contents: toc(22) }, { table_of_contents: toc(24) }] });
    };
    expect(await openLibraryChapterCount({ title: 'The Lantern Keeper', author: 'M. Vale' }, get)).toBe(22);
    expect(urls[1]).toContain('/works/OL1W/editions.json');
  });

  it('nothing when no edition has a table of contents', async () => {
    expect(await openLibraryChapterCount({ title: 'X', author: 'Y', olWork: '/works/OL1W' }, () => reply({ entries: [{}, {}] }))).toBeNull();
  });
});
