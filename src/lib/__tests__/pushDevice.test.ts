import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { disablePush, enablePush, PUSH_TOKEN_KEY, syncPushLanguage } from '../pushDevice';
import { supabase } from '../supabase';

// Only the native modules are stood in; the device token is kept in the real local database.
jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
}));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { eas: { projectId: 'project-1' } } }, easConfig: null } }));

const notifications = jest.mocked(Notifications);
const device = Device as { isDevice: boolean };
const constants = Constants as unknown as { expoConfig: unknown; easConfig: unknown };
const password = 'test-password-1234';
const run = Date.now().toString(36);
const token = `ExponentPushToken[device-${run}]`;
const OS = Platform.OS;
let me: string;

const language = async () =>
  (await supabase.from('push_tokens').select('language, platform, user_id').eq('token', token).maybeSingle().throwOnError()).data;

beforeAll(async () => {
  const { data, error } = await supabase.auth.signUp({ email: `device-${run}@example.test`, password });
  if (error || !data.user) throw error ?? new Error('could not sign up');
  me = data.user.id;
  await supabase.from('profiles').insert({ id: me, username: `device_${run}` }).throwOnError();
});

afterAll(async () => {
  await supabase.auth.signOut();
});

beforeEach(async () => {
  for (const fn of Object.values(notifications)) if (jest.isMockFunction(fn)) fn.mockReset();
  await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
  device.isDevice = true;
  Platform.OS = 'ios';
  constants.expoConfig = { extra: { eas: { projectId: 'project-1' } } };
  constants.easConfig = null;
  notifications.getPermissionsAsync.mockResolvedValue({ granted: false } as never);
  notifications.requestPermissionsAsync.mockResolvedValue({ granted: true } as never);
  notifications.getExpoPushTokenAsync.mockResolvedValue({ data: token, type: 'expo' });
});

afterEach(async () => {
  Platform.OS = OS;
  await supabase.from('push_tokens').delete().eq('token', token);
});

describe('enablePush', () => {
  it('asks permission, registers the token with the language and keeps it', async () => {
    expect(await enablePush('bg')).toBe('enabled');
    expect(notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'project-1' });
    expect(await language()).toEqual({ language: 'bg', platform: 'ios', user_id: me });
    expect(await AsyncStorage.getItem(PUSH_TOKEN_KEY)).toBe(token);
    expect(notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
  });

  it('does not ask again when permission was already given', async () => {
    notifications.getPermissionsAsync.mockResolvedValue({ granted: true } as never);
    expect(await enablePush('en')).toBe('enabled');
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('creates the default channel first on Android', async () => {
    Platform.OS = 'android';
    expect(await enablePush('en')).toBe('enabled');
    expect(notifications.setNotificationChannelAsync).toHaveBeenCalledWith('default', expect.objectContaining({ name: 'Livami', importance: 3 }));
    expect((await language())?.platform).toBe('android');
  });

  it('takes the project id from the EAS config when the app config has none', async () => {
    constants.expoConfig = {};
    constants.easConfig = { projectId: 'project-2' };
    expect(await enablePush('en')).toBe('enabled');
    expect(notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'project-2' });
  });

  it('is denied when the reader says no, and stores nothing', async () => {
    notifications.requestPermissionsAsync.mockResolvedValue({ granted: false } as never);
    expect(await enablePush('en')).toBe('denied');
    expect(notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(PUSH_TOKEN_KEY)).toBeFalsy();
    expect(await language()).toBeNull();
  });

  it('is unsupported off a physical device and on the web', async () => {
    device.isDevice = false;
    expect(await enablePush('en')).toBe('unsupported');
    device.isDevice = true;
    Platform.OS = 'web';
    expect(await enablePush('en')).toBe('unsupported');
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('is not configured without an EAS project, and never asks permission for nothing', async () => {
    constants.expoConfig = { extra: {} };
    expect(await enablePush('en')).toBe('not-configured');
    expect(notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(PUSH_TOKEN_KEY)).toBeFalsy();
  });
});

describe('after enabling', () => {
  it('a language change registers the device again in the new language', async () => {
    await enablePush('en');
    await syncPushLanguage('bg');
    expect((await language())?.language).toBe('bg');
  });

  it('a language change does nothing while pushes are off', async () => {
    await syncPushLanguage('bg');
    expect(await language()).toBeNull();
  });

  it('turning off forgets the device and clears the stored token', async () => {
    await enablePush('en');
    await disablePush();
    expect(await language()).toBeNull();
    expect(await AsyncStorage.getItem(PUSH_TOKEN_KEY)).toBeFalsy();
  });

  it('turning off when nothing is stored is fine', async () => {
    await expect(disablePush()).resolves.toBeUndefined();
  });
});
