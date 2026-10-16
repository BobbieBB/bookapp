import { useEffect, useEffectEvent, useState } from 'react';

type Settled<T> = { key: string; data?: T; error?: unknown };

/**
 * Loads something for `key` (after `delayMs`), cancelling the previous request whenever the key
 * changes. A result is only shown for the key it was loaded for, so a slow stale answer never
 * replaces a newer one. A null key loads nothing.
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
          if (!ctrl.signal.aborted) setSettled({ key, data });
        },
        (error: unknown) => {
          if (!ctrl.signal.aborted) setSettled({ key, error });
        },
      );
    }, delayMs);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [key, delayMs]);

  const current = key !== null && settled?.key === key ? settled : null;
  return { loading: key !== null && !current, data: current?.data, error: current?.error };
}
