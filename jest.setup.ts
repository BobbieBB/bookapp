import NotificationsEmitterModule from 'expo-notifications/build/NotificationsEmitterModule';
import NotificationsHandlerModule from 'expo-notifications/build/NotificationsHandlerModule';

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

// jest-expo stands in every native module function with `async () => {}`, so the notification
// modules' addListener returns a Promise. expo-notifications 58 calls these modules directly and
// `.remove()`s what they return (setNotificationHandler drops the default handler it subscribed on
// import; PushEffects removes its push-tap listener on unmount), which then throws. On a phone,
// addListener returns an EventSubscription; give the stand-ins the same shape.
for (const module of [NotificationsEmitterModule, NotificationsHandlerModule]) {
  jest.mocked(module.addListener).mockImplementation(() => ({ remove: () => {} }));
}
