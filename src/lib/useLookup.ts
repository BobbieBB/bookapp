import { useEffect, useEffectEvent, useState } from 'react';

type Settled<T> = {
  key: string;
  data?: T;
  error?: unknown;
  stale: boolean; // the key changed since: this answer is no longer current, even if the key comes back
  last?: T; // the most recent successful answer, for any key
};

/**
 * Loads something for `key` (after `delayMs`), cancelling the previous request whenever the key
 * changes. `data` / `error` are only ever the answer to the current key from the current request,
 * so a slow stale answer, or an old answer to a key that comes back, never shows as current.
 * `previous` is the last successful answer for any key, to keep on screen while the next loads.
 * A null key loads nothing.
 */
export function useLookup<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>, delayMs = 0) {
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const run = useEffectEvent(load);

  useEffect(() => {
    if (key === null) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      run(ctrl.signal).then(
        (data) => {
          if (!ctrl.signal.aborted) setSettled({ key, data, stale: false, last: data });
        },
        (error: unknown) => {
          if (!ctrl.signal.aborted) setSettled((s) => ({ key, error, stale: false, last: s?.last }));
        },
      );
    }, delayMs);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
      setSettled((s) => (s && !s.stale ? { ...s, stale: true } : s));
    };
  }, [key, delayMs]);

  const current = key !== null && settled && !settled.stale && settled.key === key ? settled : null;
  return { loading: key !== null && !current, data: current?.data, error: current?.error, previous: settled?.last };
}
