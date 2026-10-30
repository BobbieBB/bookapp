import { translate, type Language } from '../../i18n';
import { progressLine, sectionTotal, statusKey } from '../library';
import type { LibraryEntry, LibraryStatus } from '../types';

function entry(
  story: Partial<LibraryEntry['story']>,
  progress: { status?: LibraryStatus; section: number },
): LibraryEntry {
  return {
    story_id: 's1',
    status: progress.status ?? 'currently_reading',
    is_favourite: false,
    progress_section: progress.section,
    progress_page: null,
    updated_at: '2026-10-16T00:00:00Z',
    story: {
      id: 's1',
      kind: 'book',
      title: 'T',
      author_name: 'A',
      fandoms: [],
      ships: [],
      has_chapters: true,
      published_sections: null,
      total_sections: null,
      page_count: null,
      status: 'completed',
      source_url: null,
      ...story,
    },
  };
}

const line = (language: Language, e: LibraryEntry) =>
  progressLine(e, (key, params) => translate(language, key, params));

describe.each([
  ['en', { chapters: 'Finished chapter 3 of 10', noTotal: 'Finished chapter 3', parts: 'Finished part 2 of 3', notStarted: 'Not started', done: 'Finished' }],
  ['bg', { chapters: 'Прочетена глава 3 от 10', noTotal: 'Прочетена глава 3', parts: 'Прочетена част 2 от 3', notStarted: 'Още не е започнато', done: 'Прочетено' }],
] as const)('progressLine in %s', (language, want) => {
  it('counts chapters against the published total', () => {
    expect(line(language, entry({ published_sections: 10, total_sections: 12 }, { section: 3 }))).toBe(want.chapters);
  });

  it('falls back to the planned total, then to no total at all', () => {
    expect(line(language, entry({ total_sections: 10 }, { section: 3 }))).toBe(want.chapters);
    expect(line(language, entry({}, { section: 3 }))).toBe(want.noTotal);
  });

  it('counts 25-page parts for a book without chapters', () => {
    expect(line(language, entry({ has_chapters: false, page_count: 60 }, { section: 2 }))).toBe(want.parts);
  });

  it('says so when nothing is read yet, and when the story is finished', () => {
    expect(line(language, entry({ published_sections: 10 }, { section: 0 }))).toBe(want.notStarted);
    expect(line(language, entry({ published_sections: 10 }, { section: 10, status: 'finished' }))).toBe(want.done);
  });
});

describe('a WIP fic marked Finished is "Caught up"', () => {
  const wip = { kind: 'fanfic' as const, status: 'ongoing' as const, published_sections: 16 };
  it('names the status "Caught up" only on a WIP', () => {
    expect(statusKey('finished', wip)).toBe('library.status.caughtUp');
    expect(statusKey('finished', { kind: 'fanfic', status: 'completed' })).toBe('library.status.finished');
    expect(statusKey('currently_reading', wip)).toBe('library.status.currently_reading');
  });
  it('shows how far, in both languages', () => {
    expect(line('en', entry(wip, { section: 16, status: 'finished' }))).toBe('Caught up · 16 of 16 chapters');
    expect(line('bg', entry(wip, { section: 16, status: 'finished' }))).toBe('Стигнах докрай · 16 от 16 глави');
  });
});

describe('sectionTotal', () => {
  it('rounds pages up to whole 25-page parts', () => {
    expect(sectionTotal(entry({ has_chapters: false, page_count: 51 }, { section: 0 }))).toBe(3);
  });
});
