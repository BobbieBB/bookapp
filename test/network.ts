// Real requests to the local stack, with one test-only control: holding a request back until
// the test releases it, to force an order of responses (e.g. a stale reply arriving last).
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

export async function networkFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = input instanceof Request ? input.url : String(input);
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
