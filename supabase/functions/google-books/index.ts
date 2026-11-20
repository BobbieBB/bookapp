// Book search on Google Books, for signed-in readers (PO, 19 Nov 2026). The app never talks to Google
// itself: the API key stays here (secret GOOGLE_BOOKS_KEY), and Google sees our server, not the
// reader's phone. Only the search text is sent; no account details. verify_jwt stays on (the default),
// so only requests with a reader's session get in.
import { cleanQuery, googleParams, mapVolumes } from './books.ts';

const GOOGLE = 'https://www.googleapis.com/books/v1/volumes';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
  const key = Deno.env.get('GOOGLE_BOOKS_KEY');
  if (!key) return json(503, { error: 'GOOGLE_BOOKS_KEY is not set' });

  let body: { q?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'expected JSON' });
  }
  const q = cleanQuery(body.q);
  if (!q) return json(400, { error: 'q must be 3 to 200 characters' });

  const params = googleParams(q);
  params.set('key', key);
  const res = await fetch(`${GOOGLE}?${params}`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (!res) return json(502, { error: 'Google Books did not answer' });
  if (!res.ok) {
    // Never log the URL: it carries the key.
    console.error('Google Books search failed', res.status);
    return json(502, { error: `Google Books search failed (${res.status})` });
  }
  return json(200, { books: mapVolumes(await res.json()) });
});
