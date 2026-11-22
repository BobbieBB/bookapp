// Discover's "Books | Fanfiction" switch (docs/DECISIONS.md, decision F), for readers of both: remembered on this
// device, like "Complete only" (src/lib/completeOnly.ts). Never stored on the server.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

export const DISCOVER_KIND_STORAGE_KEY = 'livami.discover.kind';

export type DiscoverKind = 'book' | 'fanfic';

/**
 * Off for the closed test (PO, 22 Nov 2026): Discover and Livami search show books only, and Profile has no
 * "Your fandoms". A fic is added only from its AO3 link, so only a reader who found it on AO3 reaches its rooms;
 * Livami does not advertise fics to strangers. The fic feed, the switch and the fandom picker stay in the code:
 * turning this on brings them back.
 */
export const FICS_IN_DISCOVER = false;

/**
 * The reader's choice; null until the remembered one has been read. Books until they pick fanfiction (PO, 21 Nov
 * 2026: more readers come for books, and Discover looked fic-only).
 */
export function useDiscoverKind(): [DiscoverKind | null, (kind: DiscoverKind) => void] {
  const [kind, setState] = useState<DiscoverKind | null>(null);

  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(DISCOVER_KIND_STORAGE_KEY)
      .catch(() => null) // unreadable storage: books
      .then((stored) => {
        // A tap that came before the read wins: it is newer than what was stored.
        if (live) setState((chosen) => chosen ?? (stored === 'fanfic' ? 'fanfic' : 'book'));
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
