// The reader's Appearance choice (docs/DECISIONS.md, "Calm theme"): Auto · Light · Dark · Calm. Auto follows
// the phone; a choice made in Profile is remembered on this device, the way the language is (src/i18n).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance as NativeAppearance, Platform } from 'react-native';

import { AppearanceContext, type Appearance } from './theme';

export type { Appearance };
export const APPEARANCES: readonly Appearance[] = ['auto', 'light', 'dark', 'calm'];
export const APPEARANCE_STORAGE_KEY = 'livami.appearance';

const isAppearance = (v: unknown): v is Appearance => APPEARANCES.includes(v as Appearance);

/** What the phone's own chrome (keyboard, alerts) should look like: Calm is light-based; Auto ('unspecified') hands control back to the phone. */
const chromeScheme = (a: Appearance) => (a === 'auto' ? 'unspecified' : a === 'dark' ? 'dark' : 'light');

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

  useEffect(() => {
    // react-native-web's setColorScheme throws (no native module behind it): on the web the in-app palette is all there is.
    if (appearance && Platform.OS !== 'web') NativeAppearance.setColorScheme(chromeScheme(appearance));
  }, [appearance]);

  const setAppearance = useCallback((a: Appearance) => {
    setAppearanceState(a);
    AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, a).catch(() => {
      // Not saved: the choice still applies until the app restarts.
    });
  }, []);

  const value = useMemo(() => (appearance ? { appearance, setAppearance } : null), [appearance, setAppearance]);
  if (!value) return null;

  return <AppearanceContext value={value}>{children}</AppearanceContext>;
}

export function useAppearance() {
  const state = use(AppearanceContext);
  if (!state) throw new Error('useAppearance must be used inside <AppearanceProvider>');
  return state;
}
