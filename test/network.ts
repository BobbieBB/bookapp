// Real requests to the local stack, with three test-only controls: holding a request back until
// the test releases it, to force an order of responses (e.g. a stale reply arriving last), failing
// requests as if the phone had gone offline, and recording what the app sent.
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

type ResponseHold = { matches: (url: string) => boolean; released: Promise<void>; sent: () => void };
const responseHolds: ResponseHold[] = [];

/**
 * Sends the next request that `matches` at once, but keeps its answer back until `release` is called: the
 * database has answered, and the app hears it late (a slow read overtaken by a newer write).
 */
export function holdResponse(matches: (url: string) => boolean) {
  let release!: () => void;
  let sent!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  const answered = new Promise<void>((resolve) => (sent = resolve));
  responseHolds.push({ matches, released, sent });
  return { release, answered };
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

type Recorder = { matches: (url: string) => boolean; bodies: string[] };
const recorders: Recorder[] = [];

/** Records the body of every request that `matches` (still sent for real) until `stop` is called. */
export function recordRequests(matches: (url: string) => boolean) {
  const recorder: Recorder = { matches, bodies: [] };
  recorders.push(recorder);
  return {
    bodies: recorder.bodies,
    stop: () => {
      const index = recorders.indexOf(recorder);
      if (index !== -1) recorders.splice(index, 1);
    },
  };
}

export async function networkFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = input instanceof Request ? input.url : String(input);
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  for (const r of recorders) if (r.matches(url)) r.bodies.push(typeof init?.body === 'string' ? init.body : '');
  const failing = failures.findIndex((f) => f.matches(url, method));
  if (failing !== -1) {
    throw new TypeError('Network request failed');
  }
  const late = responseHolds.findIndex((h) => h.matches(url));
  if (late !== -1) {
    const [hold] = responseHolds.splice(late, 1);
    const response = await nodeFetch(input, init);
    hold.sent();
    await hold.released;
    return response;
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
