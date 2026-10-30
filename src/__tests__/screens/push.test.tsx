import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { Text } from 'react-native';

import Profile from '../../../app/(tabs)/profile';
import { renderScreen } from '../../../test/router';
import { PushEffects } from '../../components/PushEffects';
import { PUSH_TOKEN_KEY } from '../../lib/pushDevice';
import { supabase } from '../../lib/supabase';

// Push on this phone (docs/DECISIONS.md, Spoiler Safe Mode 5). Only the native modules are stood in;
// the reader and their device token live in local Supabase.
jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(),
  clearLastNotificationResponse: jest.fn(),
}));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { eas: { projectId: 'project-1' } } }, easConfig: null } }));

const notifications = jest.mocked(Notifications);
const password = 'test-password-1234';
const run = Date.now().toString(36);
const token = `ExponentPushToken[screen-${run}]`;
const story = '0f8fad5b-d9cb-469f-a165-70867728950e';

beforeAll(async () => {
  const { data, error } = await supabase.auth.signUp({ email: `push-${run}@example.test`, password });
  if (error || !data.user) throw error ?? new Error('could not sign up');
  await supabase.from('profiles').insert({ id: data.user.id, username: `push_${run}` }).throwOnError();
});

afterAll(async () => {
  await supabase.auth.signOut();
});

const registered = async () =>
  (await supabase.from('push_tokens').select('language').eq('token', token).maybeSingle().throwOnError()).data;

beforeEach(async () => {
  for (const fn of Object.values(notifications)) if (jest.isMockFunction(fn)) fn.mockReset();
  await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
  notifications.getPermissionsAsync.mockResolvedValue({ granted: false } as never);
  notifications.requestPermissionsAsync.mockResolvedValue({ granted: true } as never);
  notifications.getExpoPushTokenAsync.mockResolvedValue({ data: token, type: 'expo' });
  notifications.addNotificationResponseReceivedListener.mockReturnValue({ remove: jest.fn() });
  notifications.getLastNotificationResponseAsync.mockResolvedValue(null);
});

afterEach(async () => {
  await supabase.from('push_tokens').delete().eq('token', token);
});

describe.each([
  ['en', 'Notifications on this phone'],
  ['bg', 'Известия на този телефон'],
] as const)('Profile in %s', (language, label) => {
  it('switching on registers this phone in the reader’s language, switching off forgets it', async () => {
    await renderScreen(language, { profile: Profile }, '/profile');
    const toggle = await screen.findByLabelText(label);
    expect(toggle.props.value).toBe(false);

    await fireEvent(toggle, 'valueChange', true);
    await waitFor(async () => expect(await registered()).toEqual({ language }));
    await waitFor(() => expect(screen.getByLabelText(label).props.value).toBe(true));

    await fireEvent(screen.getByLabelText(label), 'valueChange', false);
    await waitFor(async () => expect(await registered()).toBeNull());
    expect(screen.getByLabelText(label).props.value).toBe(false);
  });

  it('starts on when this phone is already registered', async () => {
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
    await renderScreen(language, { profile: Profile }, '/profile');
    await waitFor(() => expect(screen.getByLabelText(label).props.value).toBe(true));
  });
});

describe('Profile when pushes cannot be turned on', () => {
  async function press(expected: string, language: 'en' | 'bg' = 'en') {
    await renderScreen(language, { profile: Profile }, '/profile');
    await fireEvent(await screen.findByLabelText(language === 'en' ? 'Notifications on this phone' : 'Известия на този телефон'), 'valueChange', true);
    expect(await screen.findByText(expected)).toBeOnTheScreen();
    expect(screen.getByLabelText(language === 'en' ? 'Notifications on this phone' : 'Известия на този телефон').props.value).toBe(false);
  }

  it('says so when the reader refuses', async () => {
    notifications.requestPermissionsAsync.mockResolvedValue({ granted: false } as never);
    await press('Turn on notifications for Livami in your phone’s settings.');
  });

  it('says so in Bulgarian', async () => {
    notifications.requestPermissionsAsync.mockResolvedValue({ granted: false } as never);
    await press('Включи известията за Livami в настройките на телефона си.', 'bg');
  });

  it('says so when the token cannot be fetched', async () => {
    notifications.getExpoPushTokenAsync.mockRejectedValue(new Error('offline'));
    await press('Could not change notifications. Please try again.');
  });
});

describe('Profile without an EAS project', () => {
  it('says the notifications are not set up yet', async () => {
    const constants = jest.requireMock('expo-constants').default;
    constants.expoConfig = { extra: {} };
    try {
      await renderScreen('en', { profile: Profile }, '/profile');
      await fireEvent(await screen.findByLabelText('Notifications on this phone'), 'valueChange', true);
      expect(await screen.findByText('Notifications don’t work in this version of the app yet.')).toBeOnTheScreen();
    } finally {
      constants.expoConfig = { extra: { eas: { projectId: 'project-1' } } };
    }
  });
});

describe('tapping a push', () => {
  const routes = {
    index: () => (
      <>
        <PushEffects />
        <Text>Home stub</Text>
      </>
    ),
    'room/[storyId]/[room]': () => <Text>Room stub</Text>,
  };
  const response = (url: unknown) =>
    ({ notification: { request: { content: { data: { url } } } } }) as unknown as Notifications.NotificationResponse;
  const tap = async (url: unknown) => {
    const listener = notifications.addNotificationResponseReceivedListener.mock.calls[0][0];
    await act(async () => listener(response(url)));
  };

  it('opens the room it points to', async () => {
    await renderScreen('en', routes, '/');
    await tap(`/room/${story}/3`);
    expect(await screen.findByText('Room stub')).toBeOnTheScreen();
  });

  it('goes nowhere for a link that is not a room', async () => {
    await renderScreen('en', routes, '/');
    await tap('https://evil.example/room');
    await tap('/settings');
    expect(screen.getByText('Home stub')).toBeOnTheScreen();
    expect(screen.queryByText('Room stub')).toBeNull();
  });

  it('opens the room of the push that launched the app, and only once', async () => {
    notifications.getLastNotificationResponseAsync.mockResolvedValue(response(`/room/${story}/epilogue`));
    await renderScreen('en', routes, '/');
    expect(await screen.findByText('Room stub')).toBeOnTheScreen();
    expect(notifications.clearLastNotificationResponse).toHaveBeenCalledTimes(1);
  });

  it('stops listening when it goes away', async () => {
    const remove = jest.fn();
    notifications.addNotificationResponseReceivedListener.mockReturnValue({ remove });
    const { unmount } = await renderScreen('en', routes, '/');
    await act(async () => unmount());
    expect(remove).toHaveBeenCalled();
  });
});
