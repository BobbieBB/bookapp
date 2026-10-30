import { canComplete, canReopen, finishedFields, nextChapter, pagePercent, type ProgressStory } from '../story';

const book = (o: Partial<ProgressStory> = {}): ProgressStory => ({
  kind: 'book',
  status: 'completed',
  has_chapters: true,
  published_sections: null,
  total_sections: 20,
  page_count: 300,
  completed_at: null,
  ...o,
});

const wip = (o: Partial<ProgressStory> = {}): ProgressStory => ({
  kind: 'fanfic',
  status: 'ongoing',
  has_chapters: true,
  published_sections: 5,
  total_sections: null,
  page_count: null,
  completed_at: null,
  ...o,
});

describe('nextChapter: what "I finished chapter N" offers', () => {
  it('offers the chapter after your progress', () => {
    expect(nextChapter(book(), 3)).toEqual({ chapter: 4, newlyPublished: false });
  });

  it('offers nothing once you finished the last chapter of a complete story', () => {
    expect(nextChapter(book(), 20)).toBeNull();
  });

  it('on a WIP fic you are caught up with, the next chapter is a newly published one', () => {
    expect(nextChapter(wip(), 5)).toEqual({ chapter: 6, newlyPublished: true });
  });

  it('a WIP fic with no chapter count yet starts at chapter 1', () => {
    expect(nextChapter(wip({ published_sections: null }), 0)).toEqual({ chapter: 1, newlyPublished: true });
  });

  it('never offers a WIP chapter past a known total (the database would refuse it)', () => {
    expect(nextChapter(wip({ published_sections: 5, total_sections: 5 }), 5)).toBeNull();
  });

  it('a WIP fic with only a total and no published count starts at chapter 1', () => {
    expect(nextChapter(wip({ published_sections: null, total_sections: 8 }), 0)).toEqual({ chapter: 1, newlyPublished: true });
  });

  it('books without chapters (25-page parts) have no chapter button', () => {
    expect(nextChapter(book({ has_chapters: false, total_sections: null }), 0)).toBeNull();
  });
});

describe('pagePercent: personal page progress for books', () => {
  it('is a whole percentage of the page count', () => {
    expect(pagePercent(143, 300)).toBe(48);
  });

  it('never goes past 100 or below 0', () => {
    expect(pagePercent(400, 300)).toBe(100);
    expect(pagePercent(-3, 300)).toBe(0);
  });

  it('is unknown without a page count or a page', () => {
    expect(pagePercent(10, null)).toBeNull();
    expect(pagePercent(null, 300)).toBeNull();
  });
});

describe('canComplete: marking a WIP fic complete (caught-up readers only)', () => {
  it('a caught-up reader can mark an ongoing fic complete', () => {
    expect(canComplete(wip(), 5)).toBe(true);
  });

  it('not before any chapter count is known (nothing to complete with)', () => {
    expect(canComplete(wip({ published_sections: null }), 0)).toBe(false);
  });

  it('a reader behind the published chapters cannot', () => {
    expect(canComplete(wip(), 4)).toBe(false);
  });

  it('only for ongoing fics', () => {
    expect(canComplete(book(), 20)).toBe(false);
    expect(canComplete(wip({ status: 'completed', total_sections: 5 }), 5)).toBe(false);
  });
});

describe('canReopen: undoing a completion within 7 days', () => {
  const now = new Date('2026-10-16T12:00:00Z');
  const completed = (completedAt: string) =>
    wip({ status: 'completed', total_sections: 5, completed_at: completedAt });

  it('a caught-up reader can reopen within 7 days', () => {
    expect(canReopen(completed('2026-10-10T12:00:01Z'), 5, now)).toBe(true);
  });

  it('not after 7 days', () => {
    expect(canReopen(completed('2026-10-09T12:00:00Z'), 5, now)).toBe(false);
  });

  it('not when chapters were added since', () => {
    expect(canReopen(wip({ status: 'completed', total_sections: 5, published_sections: 6, completed_at: '2026-10-15T00:00:00Z' }), 6, now)).toBe(false);
  });

  it('not for a reader who is behind', () => {
    expect(canReopen(completed('2026-10-15T00:00:00Z'), 4, now)).toBe(false);
  });

  it('never for books, or fics that were complete when added', () => {
    expect(canReopen(book({ completed_at: null }), 20, now)).toBe(false);
    expect(canReopen(wip({ status: 'completed', total_sections: 5, completed_at: null }), 5, now)).toBe(false);
  });
});

describe('finishedFields: what "Finished" saves', () => {
  it('on a WIP fic, also catches progress up to the last published chapter', () => {
    expect(finishedFields(wip())).toEqual({ status: 'finished', progress_section: 5 });
  });
  it('anywhere else, only the status', () => {
    expect(finishedFields(book())).toEqual({ status: 'finished' });
    expect(finishedFields(wip({ status: 'completed', total_sections: 5 }))).toEqual({ status: 'finished' });
    expect(finishedFields(wip({ published_sections: null }))).toEqual({ status: 'finished' });
  });
});
