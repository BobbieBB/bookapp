import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';

import RoomScreen from '../../../app/room/[storyId]/[room]';
import { renderScreen } from '../../../test/router';
import type { Language } from '../../i18n';
import { openRoom } from '../../lib/discussions';
import { PUSH_OFFER_KEY, PUSH_TOKEN_KEY } from '../../lib/pushDevice';
import { addToLibrary, createManualBook } from '../../lib/stories';
import { supabase } from '../../lib/supabase';

// "Want to know when someone replies?" right after posting (docs/DECISIONS.md, "Push notifications"):
// only "Yes" shows the one-time OS prompt; after "Not now" we don't ask again for 30 days.
// Only the native modules are stood in; the reader, the room and the device token live in local Supabase.
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
const password = 'test-password-1234';
const run = Date.now().toString(36);
const token = `ExponentPushToken[offer-${run}]`;
const DAY = 24 * 60 * 60 * 1000;
let storyId = '';
let n = 0;

beforeAll(async () => {
  const { data, error } = await supabase.auth.signUp({ email: `offer-${run}@example.test`, password });
  if (error || !data.user) throw error ?? new Error('could not sign up');
  await supabase.from('profiles').insert({ id: data.user.id, username: `offer_${run}` }).throwOnError();
  storyId = (await createManualBook({ title: 'Offer Book', author: 'x', chapters: 2, language: 'en' })).id;
  await addToLibrary(storyId, 'finished');
  await openRoom(storyId, 'chapter', 1);
});

afterAll(async () => {
  await supabase.from('push_tokens').delete().eq('token', token);
  await supabase.removeAllChannels();
  await supabase.auth.signOut();
});

beforeEach(async () => {
  for (const fn of Object.values(notifications)) if (jest.isMockFunction(fn)) fn.mockReset();
  await AsyncStorage.multiRemove([PUSH_TOKEN_KEY, PUSH_OFFER_KEY]);
  notifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true } as never);
  notifications.requestPermissionsAsync.mockResolvedValue({ granted: true } as never);
  notifications.getExpoPushTokenAsync.mockResolvedValue({ data: token, type: 'expo' });
});

const ASK = { en: 'Want to know when someone replies?', bg: 'Искаш ли да разбереш, когато някой ти отговори?' };

async function postIn(language: Language) {
  await renderScreen(language, { 'room/[storyId]/[room]': RoomScreen }, `/room/${storyId}/1`);
  await screen.findByTestId('room-title', {}, { timeout: 20_000 });
  const text = `comment ${run} ${n++}`;
  await fireEvent.changeText(screen.getByLabelText(language === 'en' ? 'Add to the discussion' : 'Добави към обсъждането'), text);
  await fireEvent.press(screen.getByText(language === 'en' ? 'Post' : 'Публикувай'));
  await screen.findByText(text, {}, { timeout: 8000 });
}

it('after posting, "Yes" asks the phone and turns pushes on; then it never asks again', async () => {
  await postIn('en');
  expect(await screen.findByText(ASK.en, {}, { timeout: 8000 })).toBeOnTheScreen();
  expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled(); // the sheet comes before the OS prompt
  await fireEvent.press(screen.getByText('Yes'));
  await waitFor(() => expect(screen.queryByText(ASK.en)).toBeNull(), { timeout: 8000 });
  expect(notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  await waitFor(async () => expect(await AsyncStorage.getItem(PUSH_TOKEN_KEY)).toBe(token), { timeout: 8000 });
  const { data } = await supabase.from('push_tokens').select('token').eq('token', token).throwOnError();
  expect(data).toHaveLength(1);

  await screen.unmount();
  await AsyncStorage.removeItem(PUSH_TOKEN_KEY); // even if they later switch pushes off in Profile
  await postIn('en');
  await new Promise((r) => setTimeout(r, 500));
  expect(screen.queryByText(ASK.en)).toBeNull();
});

it('"Not now" never shows the phone\'s prompt and waits 30 days before asking again', async () => {
  await postIn('en');
  await fireEvent.press(await screen.findByText('Not now', {}, { timeout: 8000 }));
  await waitFor(() => expect(screen.queryByText(ASK.en)).toBeNull(), { timeout: 8000 });
  expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  await screen.unmount();

  await postIn('en');
  await new Promise((r) => setTimeout(r, 500));
  expect(screen.queryByText(ASK.en)).toBeNull();
  await screen.unmount();

  await AsyncStorage.setItem(PUSH_OFFER_KEY, String(Date.now() - 31 * DAY));
  await postIn('en');
  expect(await screen.findByText(ASK.en, {}, { timeout: 8000 })).toBeOnTheScreen();
});

it('not asked when the phone already said no for good', async () => {
  notifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false } as never);
  await postIn('en');
  await new Promise((r) => setTimeout(r, 500));
  expect(screen.queryByText(ASK.en)).toBeNull();
});

it('in Bulgarian', async () => {
  await postIn('bg');
  expect(await screen.findByText(ASK.bg, {}, { timeout: 8000 })).toBeOnTheScreen();
  expect(screen.getByText('Да')).toBeOnTheScreen();
  expect(screen.getByText('Не сега')).toBeOnTheScreen();
});
