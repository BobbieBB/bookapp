// Chapter counts suggested for a book (PO, 28 Nov 2026: looking every count up by hand is tiresome). Neither Open
// Library nor Google Books gives a chapter count, so we suggest from two places and the reader confirms:
//   - other Livami readers: the count already set on this book in another language or edition, or under the
//     same title and author;
//   - Open Library: an edition's table of contents, where a library catalogued one (many books have none).
// Each is only a suggestion, shown with where it comes from; the reader checks it against their own copy.
import { Platform } from 'react-native';

import { APP_NAME, APP_VERSION, openLibraryUrl, PROJECT_URL } from './config';
import { likeness, normalise } from './sameFic';
import { supabase } from './supabase';

export type ChapterSuggestion = { count: number; from: 'livami' | 'open_library' };

export type BookForSuggestions = {
  title: string;
  author: string;
  /** Open Library work key ("/works/OL123W") when the book came from Open Library. */
  olWork?: string | null;
  /** The story itself, left out of "other readers". */
  excludeId?: string;
};

type TocEntry = string | { label?: string; title?: string; level?: number };

// Not chapters: front and back matter, and prologue/epilogue (readers count those differently).
const NOT_A_CHAPTER =
  /^(table of )?contents$|^copyright|^dedication|^acknowledg|^about the authors?|^index$|^notes$|^bibliography|^preface|^foreword|^introduction|^title page|^cover$|^also by|^praise|^maps?$|^glossary|^appendi|^epigraph|^afterword|^author.?s note|^excerpt|^sneak peek|^prologue|^epilogue|^съдържание|^пролог|^епилог|^бележки/iu;
const CHAPTER = /^(chapter|ch\.|глава)\s*\S+/iu;

/** How many chapters an edition's table of contents lists, or null when it can't tell (fewer than 3). */
export function tocChapterCount(toc: TocEntry[] | undefined): number | null {
  if (!toc?.length) return null;
  const entries = toc.map((e) =>
    typeof e === 'string' ? { text: e, level: 0 } : { text: `${e.label ?? ''} ${e.title ?? ''}`.trim(), level: e.level ?? 0 },
  );
  // "Chapter 1", "Chapter 2"…: count those, whatever else is listed (parts, interludes).
  const named = entries.filter((e) => CHAPTER.test(e.text)).length;
  if (named >= 3) return named;
  // Otherwise the top level, without front and back matter.
  const top = Math.min(...entries.map((e) => e.level));
  const counted = entries.filter((e) => e.level === top && e.text && !NOT_A_CHAPTER.test(normalise(e.text) || e.text)).length;
  return counted >= 3 ? counted : null;
}

/** The most common value (the smaller one on a tie). */
function mode(values: number[]): number | null {
  if (!values.length) return null;
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

const surname = (name: string) => normalise(name.split(',')[0]).split(' ').pop() ?? '';

/** The count other Livami readers set on this book (another edition or language, or the same title and author). */
export async function livamiChapterCount(book: BookForSuggestions): Promise<number | null> {
  const title = book.title.trim();
  if (!title) return null;
  const counts: number[] = [];
  if (book.olWork) {
    const { data } = await supabase
      .from('stories')
      .select('id, total_sections')
      .eq('kind', 'book')
      .eq('source', 'open_library')
      .like('source_id', `${book.olWork}#%`)
      .not('total_sections', 'is', null)
      .limit(20);
    for (const s of data ?? []) if (s.id !== book.excludeId && s.total_sections) counts.push(s.total_sections);
  }
  const exactly = title.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  const { data: same } = await supabase
    .from('stories')
    .select('id, author_name, total_sections')
    .eq('kind', 'book')
    .eq('has_chapters', true)
    .ilike('title', exactly)
    .not('total_sections', 'is', null)
    .limit(20);
  for (const s of same ?? []) {
    if (s.id !== book.excludeId && s.total_sections && surname(s.author_name) === surname(book.author)) counts.push(s.total_sections);
  }
  return mode(counts);
}

type Fetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

const olHeaders = () => (Platform.OS === 'web' ? undefined : { 'User-Agent': `${APP_NAME}/${APP_VERSION} (${PROJECT_URL})` });

/** The chapter count Open Library's tables of contents give for this work, or null. Two requests at most. */
export async function openLibraryChapterCount(book: BookForSuggestions, get: Fetch = fetch as unknown as Fetch): Promise<number | null> {
  let work = book.olWork ?? null;
  if (!work) {
    const params = new URLSearchParams({ q: `${book.title} ${book.author}`, fields: 'key,title,author_name', limit: '5' });
    const res = await get(`${openLibraryUrl()}/search.json?${params}`, { headers: olHeaders() });
    if (!res.ok) return null;
    const docs = ((await res.json()) as { docs?: { key: string; title?: string; author_name?: string[] }[] }).docs ?? [];
    work =
      docs.find((d) => d.title && likeness(d.title, book.title) >= 0.85 && d.author_name?.some((a) => surname(a) === surname(book.author)))?.key ?? null;
  }
  if (!work) return null;
  const res = await get(`${openLibraryUrl()}${work}/editions.json?limit=50`, { headers: olHeaders() });
  if (!res.ok) return null;
  const entries = ((await res.json()) as { entries?: { table_of_contents?: TocEntry[] }[] }).entries ?? [];
  return mode(entries.map((e) => tocChapterCount(e.table_of_contents)).filter((n): n is number => n !== null));
}

/** Both, as suggestions; one per count, Livami's first. A source that fails just suggests nothing. */
export async function suggestChapterCounts(book: BookForSuggestions, get?: Fetch): Promise<ChapterSuggestion[]> {
  const [mine, ol] = await Promise.allSettled([livamiChapterCount(book), openLibraryChapterCount(book, get)]);
  const out: ChapterSuggestion[] = [];
  if (mine.status === 'fulfilled' && mine.value) out.push({ count: mine.value, from: 'livami' });
  if (ol.status === 'fulfilled' && ol.value && !out.some((s) => s.count === ol.value)) out.push({ count: ol.value, from: 'open_library' });
  return out;
}
