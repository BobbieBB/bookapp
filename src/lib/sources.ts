// Where story details come from. We never fetch anything from AO3 (no scraping, see
// docs/DECISIONS.md): an AO3 link is only normalised and looked up in our own database.
// Books come from Open Library's public search API.

import { APP_NAME, APP_VERSION, openLibraryUrl, PROJECT_URL } from './config';
import type { BookLanguage } from './stories';

// Search starts at 3 characters, after a pause in typing (docs/DECISIONS.md, "Search-as-you-type").
const MIN_CHARS = 3;
const DEBOUNCE_MS = 350;

/** How long to wait before searching for this text: null = don't search, 0 = a pasted ISBN. */
export function searchDelay(query: string): number | null {
  const q = query.trim();
  if (q.length < MIN_CHARS) return null;
  return isbnOf(q) ? 0 : DEBOUNCE_MS;
}

/** The edition language to suggest for a title: Cyrillic means Bulgarian. */
export const guessLanguage = (title: string): BookLanguage => (/[А-Яа-яЁё]/.test(title) ? 'bg' : 'en');

/** Canonical AO3 work link, or null if the text isn't an AO3 work link. */
export function normaliseAo3Link(input: string): string | null {
  const m = input
    .trim()
    .match(/^(?:https?:\/\/)?(?:www\.)?(?:archiveofourown\.org|ao3\.org)\/(?:collections\/[^/]+\/)?works\/(\d+)(?:[/?#].*)?$/i);
  return m ? `https://archiveofourown.org/works/${m[1]}` : null;
}

/** 10- or 13-digit ISBN (hyphens and spaces allowed), digits only, or null. */
export function isbnOf(input: string): string | null {
  const digits = input.replace(/[\s-]/g, '');
  return /^(?:\d{9}[\dXx]|\d{13})$/.test(digits) ? digits.toUpperCase() : null;
}

export type BookResult = {
  key: string; // Open Library work id, e.g. "/works/OL123W"
  title: string;
  author: string;
  year: number | null;
  pages: number | null;
  coverUrl: string | null;
};

type OpenLibraryDoc = {
  key: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  number_of_pages_median?: number;
  cover_i?: number;
};

/**
 * Search Open Library by title/author, or by ISBN when the text is one.
 * Open Library is free and volunteer-run: callers only search from 3 characters and
 * after a pause in typing (docs/DECISIONS.md, "Search-as-you-type").
 */
export async function searchBooks(query: string, signal?: AbortSignal): Promise<BookResult[]> {
  const isbn = isbnOf(query);
  const params = new URLSearchParams({
    fields: 'key,title,author_name,first_publish_year,number_of_pages_median,cover_i',
    limit: '10',
  });
  if (isbn) params.set('isbn', isbn);
  else params.set('q', query.trim());

  // Open Library asks apps to identify themselves so they can get in touch (docs/DECISIONS.md).
  const res = await fetch(`${openLibraryUrl()}/search.json?${params}`, {
    signal,
    headers: { 'User-Agent': `${APP_NAME}/${APP_VERSION} (${PROJECT_URL})` },
  });
  if (!res.ok) throw new Error(`Open Library search failed (${res.status})`);
  const body = (await res.json()) as { docs?: OpenLibraryDoc[] };

  return (body.docs ?? [])
    .filter((d) => d.title && d.author_name?.length)
    .map((d) => ({
      key: d.key,
      title: d.title!.slice(0, 300),
      author: d.author_name!.slice(0, 3).join(', ').slice(0, 200),
      year: d.first_publish_year ?? null,
      pages: d.number_of_pages_median ?? null,
      coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
    }));
}
