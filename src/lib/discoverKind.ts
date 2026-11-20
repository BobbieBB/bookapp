// Discover's "Books | Fanfiction" switch (docs/DECISIONS.md, decision F), for readers of both: remembered on this
// device, like "Complete only" (src/lib/completeOnly.ts). Never stored on the server.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

export const DISCOVER_KIND_STORAGE_KEY = 'livami.discover.kind';

export type DiscoverKind = 'book' | 'fanfic';

/**
 * The reader's choice; null until the remembered one has been read. Fanfiction until they pick books: Discover was
 * fanfiction only before, so readers of both find it as they left it, with Books one tap away.
 */
export function useDiscoverKind(): [DiscoverKind | null, (kind: DiscoverKind) => void] {
  const [kind, setState] = useState<DiscoverKind | null>(null);

  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(DISCOVER_KIND_STORAGE_KEY)
      .catch(() => null) // unreadable storage: fanfiction
      .then((stored) => {
        // A tap that came before the read wins: it is newer than what was stored.
        if (live) setState((chosen) => chosen ?? (stored === 'book' ? 'book' : 'fanfic'));
      });
    return () => {
      live = false;
    };
  }, []);

  const setKind = useCallback((next: DiscoverKind) => {
    setState(next);
    AsyncStorage.setItem(DISCOVER_KIND_STORAGE_KEY, next).catch(() => {
      // Not saved: the choice still applies until Discover is opened again.
    });
  }, []);

  return [kind, setKind];
}
