import { likeness, normalise, rankFics } from '../lib/sameFic';
import type { Story } from '../lib/types';

const fic = (id: string, title: string, author: string, source_url: string | null = null) =>
  ({ id, kind: 'fanfic', title, author_name: author, fandoms: [], ships: [], source_url }) as unknown as Story;

describe('normalise: spelling aside', () => {
  it('ignores case, accents, "&", punctuation, spaces and a leading article', () => {
    expect(normalise('  The Ink & Quill!! ')).toBe('ink and quill');
    expect(normalise('Café — Noir')).toBe('cafe noir');
    expect(normalise('Мастило и перо')).toBe('мастило и перо');
  });
});

describe('likeness', () => {
  it('is 1 for the same title spelt differently, high for a typo, low for another title', () => {
    expect(likeness('Ink & Quill', 'ink and quill')).toBe(1);
    expect(likeness('The Lantern Keeper', 'The Lanturn Keeper')).toBeGreaterThan(0.9);
    expect(likeness('The Lantern Keeper', 'Paper Wings')).toBeLessThan(0.5);
  });
});

describe('rankFics', () => {
  const same = fic('1', 'Ink and Quill', 'Moth');
  const typo = fic('2', 'Ink and Quil', 'Moth');
  const other = fic('3', 'Paper Wings', 'Moth');
  const linked = fic('4', 'Ink & Quill', 'moth', 'https://archiveofourown.org/works/1');

  it('the same title and author is joined; close ones are asked about; others are left out', () => {
    expect(rankFics('Ink & Quill', 'moth', [other, typo, same])).toEqual({ same, close: [typo] });
  });

  it('a reader with their own AO3 link is offered only fics without one', () => {
    expect(rankFics('Ink & Quill', 'moth', [linked, typo], false)).toEqual({ same: null, close: [typo] });
  });

  it('another author with the same title is not the same fic', () => {
    expect(rankFics('Ink and Quill', 'Someone Else Entirely', [same]).same).toBeNull();
  });
});
