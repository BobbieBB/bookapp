// The google-books Edge Function's own logic: build the Google Books query and map its answer to the
// app's BookResult shape (src/lib/sources.ts). No network and no Deno APIs here, so Jest can test it.

export type GoogleBook = {
  key: string; // Google Books volume id
  source: 'google_books';
  title: string;
  author: string;
  year: number | null;
  pages: number | null;
  coverUrl: string | null;
};

type Volume = {
  id?: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    publishedDate?: string;
    pageCount?: number;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  };
};

const MIN_CHARS = 3;
const MAX_CHARS = 200;

/** The search text a reader may send: trimmed, 3 to 200 characters, or null. */
export function cleanQuery(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const q = input.trim().replace(/\s+/g, ' ');
  return q.length >= MIN_CHARS && q.length <= MAX_CHARS ? q : null;
}

/** Google Books request parameters for a search text (without the key). */
export function googleParams(query: string): URLSearchParams {
  const digits = query.replace(/[\s-]/g, '');
  const isbn = /^(?:\d{9}[\dXx]|\d{13})$/.test(digits);
  const params = new URLSearchParams({
    q: isbn ? `isbn:${digits.toUpperCase()}` : query,
    maxResults: '10',
    printType: 'books',
    fields: 'items(id,volumeInfo(title,authors,publishedDate,pageCount,imageLinks))',
  });
  // Cyrillic text: Bulgarian editions only (the probe of 19 Nov 2026 found 12 of 20 this way).
  if (!isbn && /[А-Яа-яЁё]/.test(query)) params.set('langRestrict', 'bg');
  return params;
}

/** Google's cover link, made https and checked against the one host the database accepts. */
export function coverOf(link: string | undefined): string | null {
  if (!link) return null;
  const url = link.replace(/^http:\/\//, 'https://').replace(/&edge=curl/g, '');
  return /^https:\/\/books\.google\.com\/books\/(publisher\/)?content\?/.test(url) ? url : null;
}

/** Google's answer as BookResults; volumes without a title or an author are dropped. */
export function mapVolumes(body: unknown): GoogleBook[] {
  const items = (body as { items?: Volume[] } | null)?.items ?? [];
  return items
    .filter((v) => v.id && v.volumeInfo?.title && v.volumeInfo.authors?.length)
    .map((v) => {
      const info = v.volumeInfo!;
      const year = Number(info.publishedDate?.slice(0, 4));
      return {
        key: v.id!.slice(0, 64),
        source: 'google_books' as const,
        title: info.title!.slice(0, 300),
        author: info.authors!.slice(0, 3).join(', ').slice(0, 200),
        year: Number.isInteger(year) && year > 0 ? year : null,
        pages: info.pageCount && info.pageCount > 0 ? info.pageCount : null,
        coverUrl: coverOf(info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail),
      };
    });
}
