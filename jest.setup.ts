import { configure } from '@testing-library/react-native';
import { networkFetch } from './test/network';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
  throw new Error(
    `App tests only run against the local Supabase stack, but EXPO_PUBLIC_SUPABASE_URL is "${url}". ` +
      'Start it with `npm run db:start` and put its URL and publishable key in .env.local.',
  );
}

// Put back Node's network globals saved by test/environment.js (jest-expo installs expo/fetch).
for (const name of ['Headers', 'Request', 'Response']) {
  Object.defineProperty(globalThis, name, {
    value: (globalThis as Record<string, unknown>)[`__node${name}`],
    writable: true,
    configurable: true,
  });
}

Object.defineProperty(globalThis, 'fetch', {
  value: networkFetch,
  writable: true,
  configurable: true,
});

// AsyncStorage is a native module, so Node needs its in-memory stand-in from the package itself.
// jest.mock factories are hoisted above imports, so they can only load modules with require().
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Screens wait on the real local database: give findBy/waitFor more than RNTL's 1 s default.
configure({ asyncUtilTimeout: 10_000 });
