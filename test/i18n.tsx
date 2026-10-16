// Render UI in a given app language, the way a reader who picked it in Profile sees it.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { LanguageProvider, STORAGE_KEY, type Language } from '../src/i18n';

export async function renderIn(language: Language, ui: ReactElement) {
  await AsyncStorage.setItem(STORAGE_KEY, language);
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

/** A `wrapper` for RNTL's render or expo-router's renderRouter, in the given language. */
export async function languageWrapper(language: Language) {
  await AsyncStorage.setItem(STORAGE_KEY, language);
  return function InLanguage({ children }: { children: ReactElement }) {
    return <LanguageProvider>{children}</LanguageProvider>;
  };
}
