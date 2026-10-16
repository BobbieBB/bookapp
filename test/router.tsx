// Render app screens through Expo Router, signed in, in a given language.
import { renderRouter } from 'expo-router/testing-library';
import type { ComponentType, ReactElement } from 'react';

import type { Language } from '../src/i18n';
import { AuthProvider } from '../src/lib/auth';
import { languageWrapper } from './i18n';

export async function renderScreen(
  language: Language,
  routes: Record<string, ComponentType>,
  initialUrl: string,
) {
  const InLanguage = await languageWrapper(language);
  await renderRouter(routes, {
    initialUrl,
    wrapper: ({ children }: { children: ReactElement }) => (
      <InLanguage>
        <AuthProvider>{children}</AuthProvider>
      </InLanguage>
    ),
  });
}
