// Discover's "Complete only" filter (docs/DECISIONS.md, "Lively in your fandoms"): off by default and
// remembered on this device, the way Appearance is (src/appearance.tsx). Never stored on the server.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

export const COMPLETE_ONLY_STORAGE_KEY = 'livami.discover.completeOnly';

/** The reader's choice; null until the remembered one has been read, so the first list is already filtered. */
export function useCompleteOnly(): [boolean | null, (on: boolean) => void] {
  const [completeOnly, setState] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(COMPLETE_ONLY_STORAGE_KEY)
      .catch(() => null) // unreadable storage: the filter stays off
      .then((stored) => {
        // A tap that came before the read wins: it is newer than what was stored.
        if (live) setState((chosen) => chosen ?? stored === 'true');
      });
    return () => {
      live = false;
    };
  }, []);

  const setCompleteOnly = useCallback((on: boolean) => {
    setState(on);
    AsyncStorage.setItem(COMPLETE_ONLY_STORAGE_KEY, String(on)).catch(() => {
      // Not saved: the choice still applies until Discover is opened again.
    });
  }, []);

  return [completeOnly, setCompleteOnly];
}
