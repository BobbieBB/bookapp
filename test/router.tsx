// Render app screens through Expo Router, signed in, in a given language.
//
// Like expo-router's renderRouter, but on real timers: renderRouter switches Jest to fake timers,
// under which findBy/waitFor time out almost instantly and Supabase's own timers can stall, while
// these screens wait on the real local database.
import { render } from '@testing-library/react-native';
import 'expo-router/testing-library'; // its stand-ins for native navigation pieces under Jest
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import type { ComponentType, ReactElement } from 'react';

import type { Language } from '../src/i18n';
import { AuthProvider } from '../src/lib/auth';
import { languageWrapper } from './i18n';

export async function renderScreen(language: Language, routes: Record<string, ComponentType>, initialUrl: string) {
  const InLanguage = await languageWrapper(language);
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync'; // load routes synchronously, as renderRouter does
  return render(<ExpoRoot context={getMockContext(routes)} location={initialUrl} />, {
    wrapper: ({ children }: { children: ReactElement }) => (
      <InLanguage>
        <AuthProvider>{children}</AuthProvider>
      </InLanguage>
    ),
  });
}
