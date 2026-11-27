// Import from Goodreads (PO, 22 Nov 2026, issue #111; built 27 Nov 2026). Goodreads has no API for new apps, so
// readers export their library as a CSV file (goodreads.com, on a computer: My Books → Import and export → Export
// Library) and Livami reads that file. Nothing else is fetched from Goodreads, and the file itself is not kept:
// only the resulting library entries and ratings.
//
// v1: books only; shelves → statuses (read → Finished, currently-reading → Currently Reading, to-read → Want to
// Read; other shelves ignored); whole-star ratings; no reviews (they would become public here). Each row is
// matched by ISBN, else by title and author, through our usual book search; rows that don't match are listed at
// the end so the reader can add them by hand. A book already in the library is skipped, not doubled. Imported
// books have no chapter count yet: the reader sets it on the book's page, and its rooms open from then on.
import { likeness, normalise } from './sameFic';
import { guessLanguage, searchBooks, type BookResult } from './sources';
import { addToLibrary, createBook, findStory } from './stories';
import { rateBook } from './reviews';
import { supabase } from './supabase';
import type { LibraryStatus } from './types';

export type GoodreadsShelf = 'read' | 'currently-reading' | 'to-read';

export type GoodreadsBook = {
  title: string;
  author: string;
  isbn: string | null;
  shelf: GoodreadsShelf;
  /** 1–5, or null when not rated (Goodreads writes 0). */
  rating: number | null;
};

export const SHELF_STATUS: Record<GoodreadsShelf, LibraryStatus> = {
  read: 'finished',
  'currently-reading': 'currently_reading',
  'to-read': 'want_to_read',
};

/** RFC 4180 CSV: quoted fields may hold commas, line breaks and doubled quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

/** Goodreads writes ISBNs as ="9780261103573" (so spreadsheets keep the zeros); empty as ="". */
function cleanIsbn(raw: string | undefined): string | null {
  const digits = (raw ?? '').replace(/[^0-9Xx]/g, '').toUpperCase();
  return digits.length === 13 || digits.length === 10 ? digits : null;
}

/** "The Two Towers (The Lord of the Rings, #2)" → "The Two Towers": the series goes, the title stays. */
export function bareTitle(title: string): string {
  return title.replace(/\s*\([^()]*#\s*[\d.]+[^()]*\)\s*$/, '').trim();
}

/**
 * The books in a Goodreads export, on the three shelves we import. Throws when the file isn't a Goodreads export,
 * so the screen can say so instead of importing nothing.
 */
export function parseGoodreadsExport(text: string): GoodreadsBook[] {
  const [header, ...rows] = parseCsv(text);
  const col = (name: string) => header?.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase()) ?? -1;
  const title = col('Title');
  const author = col('Author');
  const shelf = col('Exclusive Shelf');
  if (title < 0 || author < 0 || shelf < 0) throw new Error('not a Goodreads export');
  const isbn13 = col('ISBN13');
  const isbn10 = col('ISBN');
  const rating = col('My Rating');
  const books: GoodreadsBook[] = [];
  for (const r of rows) {
    const s = r[shelf]?.trim() as GoodreadsShelf;
    if (!(s in SHELF_STATUS)) continue;
    const t = bareTitle(r[title] ?? '');
    const a = (r[author] ?? '').trim();
    if (!t || !a) continue;
    const stars = Number(r[rating] ?? 0);
    books.push({
      title: t,
      author: a,
      isbn: cleanIsbn(r[isbn13]) ?? cleanIsbn(r[isbn10]),
      shelf: s,
      rating: Number.isInteger(stars) && stars >= 1 && stars <= 5 ? stars : null,
    });
  }
  return books;
}

/** The search result that is this book: by ISBN the first one; by title, one whose title and author match. */
export function pickMatch(book: GoodreadsBook, results: BookResult[], byIsbn: boolean): BookResult | null {
  if (byIsbn) return results[0] ?? null;
  const surname = (name: string) => normalise(name).split(' ').pop() ?? '';
  return (
    results.find(
      (r) =>
        likeness(bareTitle(r.title), book.title) >= 0.85 &&
        (surname(r.author.split(',')[0]) === surname(book.author) || likeness(r.author, book.author) >= 0.6),
    ) ?? null
  );
}

export type ImportResult = {
  added: GoodreadsBook[];
  already: GoodreadsBook[];
  notFound: GoodreadsBook[];
  failed: GoodreadsBook[];
};

export type ImportOptions = {
  onProgress?: (done: number, total: number) => void;
  /** Checked before each book: true stops the import (what's done stays done). */
  shouldStop?: () => boolean;
  /** Between books, so Open Library (volunteer-run) isn't flooded. */
  pauseMs?: number;
  search?: (query: string) => Promise<BookResult[]>;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One book after another into the reader's library. */
export async function importGoodreads(userId: string, books: GoodreadsBook[], options: ImportOptions = {}): Promise<ImportResult> {
  const { onProgress, shouldStop, pauseMs = 400, search = (q: string) => searchBooks(q) } = options;
  const result: ImportResult = { added: [], already: [], notFound: [], failed: [] };
  for (let i = 0; i < books.length; i++) {
    if (shouldStop?.()) break;
    const book = books[i];
    try {
      let match: BookResult | null = null;
      if (book.isbn) match = pickMatch(book, await search(book.isbn), true);
      if (!match) match = pickMatch(book, await search(`${book.title} ${book.author}`), false);
      if (!match) {
        result.notFound.push(book);
      } else {
        const language = guessLanguage(book.title);
        const story = (await findStory({ book: match, language })) ?? (await createBook(match, { chapters: null }, language));
        const { data: mine, error } = await supabase
          .from('library_entries')
          .select('story_id')
          .eq('story_id', story.id)
          .eq('user_id', userId)
          .maybeSingle();
        if (error) throw error;
        if (mine) {
          result.already.push(book);
        } else {
          await addToLibrary(story.id, SHELF_STATUS[book.shelf]);
          if (book.rating) await rateBook(story.id, book.rating);
          result.added.push(book);
        }
      }
    } catch {
      result.failed.push(book);
    }
    onProgress?.(i + 1, books.length);
    if (pauseMs && i < books.length - 1) await sleep(pauseMs);
  }
  return result;
}
