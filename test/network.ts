// Real requests to the local stack, with two test-only controls: holding a request back until
// the test releases it, to force an order of responses (e.g. a stale reply arriving last), and
// failing requests as if the phone had gone offline.
type Hold = { matches: (url: string) => boolean; released: Promise<void>; answered: () => void };

const holds: Hold[] = [];
const nodeFetch = (globalThis as unknown as { __nodefetch: typeof fetch }).__nodefetch;

export function holdRequest(matches: (url: string) => boolean) {
  let release!: () => void;
  let answered!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  const answer = new Promise<void>((resolve) => (answered = resolve));
  holds.push({ matches, released, answered });
  return { release, answer };
}

type Failure = { matches: (url: string, method: string) => boolean };
const failures: Failure[] = [];

/**
 * Every request that `matches` fails with a network error, as fetch does offline, until the returned
 * function is called. Every one, not just the next: supabase-js retries failed reads by itself.
 */
export function failRequests(matches: (url: string, method: string) => boolean) {
  const failure = { matches };
  failures.push(failure);
  return () => {
    const index = failures.indexOf(failure);
    if (index !== -1) failures.splice(index, 1);
  };
}

export async function networkFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = input instanceof Request ? input.url : String(input);
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const failing = failures.findIndex((f) => f.matches(url, method));
  if (failing !== -1) {
    throw new TypeError('Network request failed');
  }
  const index = holds.findIndex((h) => h.matches(url));
  if (index === -1) return nodeFetch(input, init);
  const [hold] = holds.splice(index, 1);
  await hold.released;
  try {
    return await nodeFetch(input, init);
  } finally {
    hold.answered();
  }
}
