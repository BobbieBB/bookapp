// Is this fic already in Livami? (PO, 22 Nov 2026.) Fics are out of Livami search, so when a reader adds one by
// hand, Add looks for it by title and author: the same one (spelling aside) is joined, close ones are offered
// as "Did you mean…?". Readers of one fic then share its rooms instead of splitting into copies.
import { searchStories } from './discover';
import { supabase } from './supabase';
import type { Story } from './types';

const STORY_COLUMNS =
  'id, kind, title, author_name, fandoms, ships, has_chapters, section_label, published_sections, total_sections, page_count, status, source_url';

/**
 * What a title or author is, spelling aside: case, accents, "&" for "and", punctuation, extra spaces and a
 * leading "the"/"a"/"an" don't count.
 */
export function normalise(text: string): string {
  const plain = text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  return plain.replace(/^(the|a|an) /, '');
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 1 for the same text (spelling aside), down to 0 for nothing alike. */
export function likeness(a: string, b: string): number {
  const x = normalise(a);
  const y = normalise(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  return 1 - editDistance(x, y) / Math.max(x.length, y.length);
}

/** Close enough to ask "Did you mean…?": a typo or two in the title, and the author not far off. */
const TITLE_CLOSE = 0.8;
const AUTHOR_CLOSE = 0.6;

export type FicMatches = { same: Story | null; close: Story[] };

/**
 * `same`: the title and author match (spelling aside). `close`: up to 3 others worth asking about, closest first.
 * `withLink` false (a reader who has an AO3 link): only fics still without one, since a fic with another link is
 * another work.
 */
export function rankFics(title: string, author: string, fics: Story[], withLink = true): FicMatches {
  const scored = fics
    .filter((s) => s.kind === 'fanfic' && (withLink || !s.source_url))
    .map((s) => ({ s, t: likeness(title, s.title), a: likeness(author, s.author_name) }))
    .filter(({ t, a }) => t >= TITLE_CLOSE && a >= AUTHOR_CLOSE)
    .sort((p, q) => q.t + q.a - (p.t + p.a));
  const same = scored.find(({ t, a }) => t === 1 && a === 1)?.s ?? null;
  return { same, close: scored.filter(({ s }) => s !== same).slice(0, 3).map(({ s }) => s) };
}

/** The longest words of the title, so "Ink & Quill" still finds "Ink and Quill" in a search by substring. */
function keyWords(title: string): string[] {
  return normalise(title)
    .split(' ')
    .filter((w) => w.length >= 4)
    .sort((a, b) => b.length - a.length)
    .slice(0, 2);
}

/** Looks the fic up in Livami by its title, its longest words and its author, then ranks what came back. */
export async function findFicMatches(title: string, author: string, withLink = true): Promise<FicMatches> {
  if (title.trim().length < 3 || !author.trim()) return { same: null, close: [] };
  const queries = [...new Set([title.trim(), ...keyWords(title), author.trim()].filter((q) => q.length >= 3))];
  const hits = (await Promise.all(queries.map((q) => searchStories(q)))).flat();
  const ids = [...new Set(hits.filter((h) => h.kind === 'fanfic').map((h) => h.id))];
  if (ids.length === 0) return { same: null, close: [] };
  const { data, error } = await supabase.from('stories').select(STORY_COLUMNS).in('id', ids);
  if (error) throw error;
  return rankFics(title, author, (data ?? []) as Story[], withLink);
}
