// Where story details come from. We never fetch anything from AO3 (no scraping, see
// docs/DECISIONS.md): an AO3 link is only normalised and looked up in our own database.
// Books come from Open Library's public search API and, through our own server (the google-books
// Edge Function, which holds the key), from Google Books (PO, 19 Nov 2026: Google has far more
// Bulgarian editions; Open Library more English ones).

import { Platform } from 'react-native';
import { APP_NAME, APP_VERSION, googleBooksEnabled, openLibraryUrl, PROJECT_URL } from './config';
import type { BookLanguage } from './stories';
import { supabase } from './supabase';

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

export type BookSource = 'open_library' | 'google_books';

export type BookResult = {
  key: string; // Open Library work id ("/works/OL123W") or Google Books volume id
  source: BookSource;
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
export async function searchOpenLibrary(query: string, signal?: AbortSignal): Promise<BookResult[]> {
  const isbn = isbnOf(query);
  const params = new URLSearchParams({
    fields: 'key,title,author_name,first_publish_year,number_of_pages_median,cover_i',
    limit: '10',
  });
  if (isbn) params.set('isbn', isbn);
  else params.set('q', query.trim());

  // Open Library asks apps to identify themselves so they can get in touch (docs/DECISIONS.md). Browsers
  // don't let a page set User-Agent, and Safari fails the whole request if it tries ("Load failed" on the
  // web version, PO 27 Nov 2026): there the browser's own User-Agent goes instead.
  const res = await fetch(`${openLibraryUrl()}/search.json?${params}`, {
    signal,
    headers: Platform.OS === 'web' ? undefined : { 'User-Agent': `${APP_NAME}/${APP_VERSION} (${PROJECT_URL})` },
  });
  if (!res.ok) throw new Error(`Open Library search failed (${res.status})`);
  const body = (await res.json()) as { docs?: OpenLibraryDoc[] };

  return (body.docs ?? [])
    .filter((d) => d.title && d.author_name?.length)
    .map((d) => ({
      key: d.key,
      source: 'open_library' as const,
      title: d.title!.slice(0, 300),
      author: d.author_name!.slice(0, 3).join(', ').slice(0, 200),
      year: d.first_publish_year ?? null,
      pages: d.number_of_pages_median ?? null,
      coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
    }));
}

// Google gets a few seconds; a slow answer must not hold up Open Library's results.
const GOOGLE_TIMEOUT_MS = 5000;

/** Search Google Books through our google-books Edge Function (the key never ships in the app). */
export async function searchGoogleBooks(query: string): Promise<BookResult[]> {
  if (!googleBooksEnabled()) return [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Google Books search timed out')), GOOGLE_TIMEOUT_MS);
  });
  try {
    const call = supabase.functions.invoke<{ books?: BookResult[] }>('google-books', { body: { q: query.trim() } });
    const { data, error } = await Promise.race([call, timeout]);
    if (error) throw error;
    return (data?.books ?? []).filter((b) => b.key && b.title && b.author).map((b) => ({ ...b, source: 'google_books' as const }));
  } finally {
    clearTimeout(timer);
  }
}

const MAX_RESULTS = 12;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9а-яё]/g, '');
const sameBook = (b: BookResult) => `${norm(b.title)}|${norm(b.author.split(',')[0])}`;

/**
 * Both sources at once. Cyrillic text lists Google's results first (it knows far more Bulgarian
 * editions), anything else Open Library's. The same title by the same author is shown once, from the
 * source listed first. One source failing is fine; only both failing is an error.
 */
export async function searchBooks(
  query: string,
  signal?: AbortSignal,
  google: (query: string) => Promise<BookResult[]> = searchGoogleBooks,
): Promise<BookResult[]> {
  const [ol, gb] = await Promise.allSettled([searchOpenLibrary(query, signal), google(query)]);
  if (ol.status === 'rejected' && gb.status === 'rejected') throw ol.reason;
  const fromOl = ol.status === 'fulfilled' ? ol.value : [];
  const fromGb = gb.status === 'fulfilled' ? gb.value : [];
  const ordered = guessLanguage(query) === 'bg' ? [...fromGb, ...fromOl] : [...fromOl, ...fromGb];
  const seen = new Set<string>();
  return ordered
    .filter((b) => {
      const id = sameBook(b);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, MAX_RESULTS);
}
