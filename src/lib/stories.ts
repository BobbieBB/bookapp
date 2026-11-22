import type { BookResult } from './sources';
import { supabase } from './supabase';
import type { LibraryStatus, Story } from './types';

const STORY_COLUMNS =
  'id, kind, title, author_name, fandoms, ships, has_chapters, section_label, published_sections, total_sections, page_count, status, source_url';

const UNIQUE_VIOLATION = '23505';

/** Languages a book can be read in (app supports English and Bulgarian for now). */
export type BookLanguage = 'en' | 'bg';

/**
 * Discussions are separate per edition language (PO, 15 Oct 2026): a Bulgarian and an English
 * reader of the same Open Library work get different stories, because translations can merge or
 * split chapters and chapter N must mean the same thing for everyone in a room.
 */
const bookSourceId = (key: string, language: BookLanguage) => `${key}#${language}`;

/** A story already in our catalogue: a book edition (Open Library work or Google Books volume, plus
 * language) or an AO3 fic. */
export async function findStory(
  by: { book: Pick<BookResult, 'key' | 'source'>; language: BookLanguage } | { ao3Link: string },
): Promise<Story | null> {
  let query = supabase.from('stories').select(STORY_COLUMNS);
  query =
    'book' in by
      ? query.eq('source', by.book.source).eq('source_id', bookSourceId(by.book.key, by.language))
      : query.eq('source_url', by.ao3Link);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return (data as Story | null) ?? null;
}

/** Inserts a story; if someone else added the same one a moment ago, returns theirs. */
async function insertStory(row: Record<string, unknown>, existing: () => Promise<Story | null>): Promise<Story> {
  const { data, error } = await supabase.from('stories').insert(row).select(STORY_COLUMNS).single();
  if (!error) return data as Story;
  if (error.code === UNIQUE_VIOLATION) {
    const found = await existing();
    if (found) return found;
  }
  throw error;
}

/** How a new book's discussions are split: by chapters, or by 25-page parts. */
/** Chapters known, or `null` for "not yet" (a Want to read book: set later on its page), or pages. */
/** How the add form splits a book: chapters (the default), parts, acts, or pages. */
export type SplitKind = 'chapter' | 'part' | 'act' | 'pages';

export type BookSplit = { chapters: number | null; label?: 'chapter' | 'part' | 'act' } | { pages: number };

export async function createBook(book: BookResult, split: BookSplit, language: BookLanguage): Promise<Story> {
  return insertStory(
    {
      kind: 'book',
      language,
      title: book.title,
      author_name: book.author,
      publication_year: book.year,
      cover_url: book.coverUrl,
      source: book.source,
      source_id: bookSourceId(book.key, language),
      status: 'completed',
      has_chapters: 'chapters' in split,
      section_label: 'chapters' in split ? (split.label ?? 'chapter') : 'chapter',
      total_sections: 'chapters' in split ? split.chapters : null,
      page_count: 'pages' in split ? split.pages : book.pages,
    },
    () => findStory({ book, language }),
  );
}

/** A book typed in by hand (not on Open Library). Duplicates are possible, so the UI only
 * offers this after a search came up empty or wrong (docs/DECISIONS.md). */
export async function createManualBook(b: {
  title: string;
  author: string;
  chapters: number | null;
  language: BookLanguage;
  /** Parts or acts instead of chapters, or pages for a book with no division (decision E). */
  split?: Exclude<SplitKind, 'chapter'>;
}): Promise<Story> {
  const pages = b.split === 'pages';
  const { data, error } = await supabase
    .from('stories')
    .insert({
      kind: 'book',
      language: b.language,
      title: b.title,
      author_name: b.author,
      source: 'manual',
      status: 'completed',
      has_chapters: !pages,
      section_label: b.split === 'part' || b.split === 'act' ? b.split : 'chapter',
      total_sections: pages ? null : b.chapters,
      page_count: pages ? b.chapters : null,
    })
    .select(STORY_COLUMNS)
    .single();
  if (error) throw error;
  return data as Story;
}

export const AO3_RATINGS = ['General Audiences', 'Teen And Up Audiences', 'Mature', 'Explicit', 'Not Rated'] as const;
export const AO3_WARNINGS = [
  'No Archive Warnings Apply',
  'Creator Chose Not To Use Archive Warnings',
  'Graphic Depictions Of Violence',
  'Major Character Death',
  'Rape/Non-Con',
  'Underage Sex',
] as const;

export type FicForm = {
  ao3Link: string | null; // already normalised; null for a fic added without a link (source 'manual')
  title: string;
  author: string;
  fandom: string;
  ship: string;
  complete: boolean;
  chapters: number; // published chapters (= total when complete)
  rating: (typeof AO3_RATINGS)[number];
  warnings: string[];
};

export async function createFic(f: FicForm): Promise<Story> {
  return insertStory(
    {
      kind: 'fanfic',
      title: f.title.trim(),
      author_name: f.author.trim(),
      fandoms: f.fandom.trim() ? [f.fandom.trim()] : [],
      ships: f.ship.trim() ? [f.ship.trim()] : [],
      content_rating: f.rating,
      warnings: f.warnings,
      source: f.ao3Link ? 'ao3' : 'manual',
      source_url: f.ao3Link,
      status: f.complete ? 'completed' : 'ongoing',
      has_chapters: true,
      published_sections: f.chapters,
      total_sections: f.complete ? f.chapters : null,
    },
    async () => (f.ao3Link ? findStory({ ao3Link: f.ao3Link }) : null),
  );
}

/** For ilike: % and _ match themselves, so only the same text matches (case aside). */
const exactly = (text: string) => text.trim().replace(/[\\%_]/g, (ch) => `\\${ch}`);

/**
 * A fic already in Livami with this title and author (case aside), with or without a link (PO, 22 Nov 2026):
 * a reader adding a fic without a link joins it, so readers of the same fic share its rooms. Fics stay out of
 * Livami search, so this is how the second reader finds the first one's rooms.
 */
export async function findSameFic(title: string, author: string): Promise<Story | null> {
  if (!title.trim() || !author.trim()) return null;
  const { data, error } = await supabase
    .from('stories')
    .select(STORY_COLUMNS)
    .eq('kind', 'fanfic')
    .ilike('title', exactly(title))
    .ilike('author_name', exactly(author))
    .order('created_at')
    .limit(1);
  if (error) throw error;
  return (data?.[0] as Story | undefined) ?? null;
}

/** "Add the AO3 link" to a fic added without one (readers who have it; admins). */
export async function setFicLink(storyId: string, link: string): Promise<void> {
  const { error } = await supabase.rpc('set_fic_link', { p_story: storyId, p_link: link });
  if (error) throw error;
}

/** Adds the story to the signed-in reader's library (or updates its status if already there). */
export async function addToLibrary(storyId: string, status: LibraryStatus) {
  const { error } = await supabase
    .from('library_entries')
    .upsert({ story_id: storyId, status }, { onConflict: 'user_id,story_id' });
  if (error) throw error;
}
