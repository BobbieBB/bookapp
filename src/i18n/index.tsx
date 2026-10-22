// The app's UI language: English or Bulgarian (docs/DECISIONS.md, "Language"). The phone's language
// by default; a choice made in Profile is remembered on this device.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';

import { bg } from './bg';
import { en, type MessageKey } from './en';
import type { Message } from './types';

export type Language = 'en' | 'bg';
export const LANGUAGES: readonly Language[] = ['en', 'bg'];
export const STORAGE_KEY = 'livami.language';

const dictionaries: Record<Language, Record<MessageKey, Message>> = { en, bg };

/**
 * The plural form for a number. English and Bulgarian both have just "one" (exactly 1) and "other".
 * Written out by hand: Hermes on iOS has no Intl.PluralRules, so `new Intl.PluralRules` crashes the
 * app at start-up there (tests run in Node, which has it).
 */
export function pluralForm(n: number): 'one' | 'other' {
  return n === 1 ? 'one' : 'other';
}

export type Params = Record<string, string | number>;

/** The text for `key` in `language`, with {placeholders} filled in; `count` picks the plural form. */
export function translate(language: Language, key: MessageKey, params: Params = {}): string {
  const message = dictionaries[language][key];
  const text =
    typeof message === 'string'
      ? message
      : (message[pluralForm(Number(params.count ?? 0))] ?? message.other);
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

const isLanguage = (v: unknown): v is Language => LANGUAGES.includes(v as Language);

export function deviceLanguage(): Language {
  try {
    return getLocales()[0]?.languageCode === 'bg' ? 'bg' : 'en';
  } catch {
    return 'en'; // the phone's language can't be read: English
  }
}

type LanguageState = { language: Language; setLanguage: (l: Language) => void };

const LanguageContext = createContext<LanguageState | null>(null);

/** Renders its children once the remembered language (if any) has been read. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language | null>(null);

  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .catch(() => null) // unreadable storage: fall back to the phone's language
      .then((stored) => {
        if (live) setLanguageState(isLanguage(stored) ? stored : deviceLanguage());
      });
    return () => {
      live = false;
    };
  }, []);

  if (!language) return null;

  const setLanguage = (l: Language) => {
    setLanguageState(l);
    AsyncStorage.setItem(STORAGE_KEY, l).catch(() => {
      // Not saved: the choice still applies until the app restarts.
    });
  };

  return <LanguageContext value={{ language, setLanguage }}>{children}</LanguageContext>;
}

export function useLanguage(): LanguageState {
  const state = use(LanguageContext);
  if (!state) throw new Error('useLanguage must be used inside <LanguageProvider>');
  return state;
}

/** `t(key, params)` in the current UI language. */
export function useT() {
  const { language } = useLanguage();
  return (key: MessageKey, params?: Params) => translate(language, key, params);
}
