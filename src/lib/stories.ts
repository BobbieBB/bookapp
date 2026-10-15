import type { BookResult } from './sources';
import { supabase } from './supabase';
import type { LibraryStatus, Story } from './types';

const STORY_COLUMNS =
  'id, kind, title, author_name, fandoms, ships, has_chapters, published_sections, total_sections, page_count, status, source_url';

const UNIQUE_VIOLATION = '23505';

/** Languages a book can be read in (app supports English and Bulgarian for now). */
export type BookLanguage = 'en' | 'bg';

/**
 * Discussions are separate per edition language (PO, 15 Oct 2026): a Bulgarian and an English
 * reader of the same Open Library work get different stories, because translations can merge or
 * split chapters and chapter N must mean the same thing for everyone in a room.
 */
const bookSourceId = (openLibraryKey: string, language: BookLanguage) => `${openLibraryKey}#${language}`;

/** A story already in our catalogue: a book edition (Open Library work + language) or an AO3 fic. */
export async function findStory(
  by: { openLibraryKey: string; language: BookLanguage } | { ao3Link: string },
): Promise<Story | null> {
  let query = supabase.from('stories').select(STORY_COLUMNS);
  query =
    'openLibraryKey' in by
      ? query.eq('source', 'open_library').eq('source_id', bookSourceId(by.openLibraryKey, by.language))
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
export type BookSplit = { chapters: number } | { pages: number };

export async function createBook(book: BookResult, split: BookSplit, language: BookLanguage): Promise<Story> {
  return insertStory(
    {
      kind: 'book',
      language,
      title: book.title,
      author_name: book.author,
      publication_year: book.year,
      cover_url: book.coverUrl,
      source: 'open_library',
      source_id: bookSourceId(book.key, language),
      status: 'completed',
      has_chapters: 'chapters' in split,
      total_sections: 'chapters' in split ? split.chapters : null,
      page_count: 'pages' in split ? split.pages : book.pages,
    },
    () => findStory({ openLibraryKey: book.key, language }),
  );
}

/** A book typed in by hand (not on Open Library). Duplicates are possible, so the UI only
 * offers this after a search came up empty or wrong (docs/DECISIONS.md). */
export async function createManualBook(b: {
  title: string;
  author: string;
  chapters: number;
  language: BookLanguage;
}): Promise<Story> {
  const { data, error } = await supabase
    .from('stories')
    .insert({
      kind: 'book',
      language: b.language,
      title: b.title,
      author_name: b.author,
      source: 'manual',
      status: 'completed',
      has_chapters: true,
      total_sections: b.chapters,
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
  ao3Link: string; // already normalised
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
      source: 'ao3',
      source_url: f.ao3Link,
      status: f.complete ? 'completed' : 'ongoing',
      has_chapters: true,
      published_sections: f.chapters,
      total_sections: f.complete ? f.chapters : null,
    },
    () => findStory({ ao3Link: f.ao3Link }),
  );
}

/** Adds the story to the signed-in reader's library (or updates its status if already there). */
export async function addToLibrary(storyId: string, status: LibraryStatus) {
  const { error } = await supabase
    .from('library_entries')
    .upsert({ story_id: storyId, status }, { onConflict: 'user_id,story_id' });
  if (error) throw error;
}
