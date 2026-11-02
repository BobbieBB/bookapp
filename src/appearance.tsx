// The reader's Appearance choice (docs/DECISIONS.md, "Calm theme"): Auto · Light · Dark · Calm. Auto follows
// the phone; a choice made in Profile is remembered on this device, the way the language is (src/i18n).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { use, useEffect, useState, type ReactNode } from 'react';

import { AppearanceContext, type Appearance } from './theme';

export type { Appearance };
export const APPEARANCES: readonly Appearance[] = ['auto', 'light', 'dark', 'calm'];
export const APPEARANCE_STORAGE_KEY = 'livami.appearance';

const isAppearance = (v: unknown): v is Appearance => APPEARANCES.includes(v as Appearance);

/** Renders its children once the remembered choice (if any) has been read, so the first frame has the right colours. */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearanceState] = useState<Appearance | null>(null);

  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(APPEARANCE_STORAGE_KEY)
      .catch(() => null) // unreadable storage: follow the phone
      .then((stored) => {
        if (live) setAppearanceState(isAppearance(stored) ? stored : 'auto');
      });
    return () => {
      live = false;
    };
  }, []);

  if (!appearance) return null;

  const setAppearance = (a: Appearance) => {
    setAppearanceState(a);
    AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, a).catch(() => {
      // Not saved: the choice still applies until the app restarts.
    });
  };

  return <AppearanceContext value={{ appearance, setAppearance }}>{children}</AppearanceContext>;
}

export function useAppearance() {
  const state = use(AppearanceContext);
  if (!state) throw new Error('useAppearance must be used inside <AppearanceProvider>');
  return state;
}
