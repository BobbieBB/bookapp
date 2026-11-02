import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react-native';
import * as ReactNative from 'react-native';
import { Appearance as NativeAppearance } from 'react-native';
import type { ReactElement } from 'react';

import Profile from '../../../app/(tabs)/profile';
import { renderScreen } from '../../../test/router';
import { AppearanceProvider, APPEARANCE_STORAGE_KEY, useAppearance } from '../../appearance';
import { supabase } from '../../lib/supabase';
import { palettes, useTheme } from '../../theme';

// Profile > Appearance (docs/DECISIONS.md, "Calm theme"): Auto · Light · Dark · Calm, remembered per device.
const password = 'test-password-1234';
const run = Date.now().toString(36);
const username = `calm_${run}`;
const { calm } = palettes;

beforeAll(async () => {
  const { data, error } = await supabase.auth.signUp({ email: `calm-${run}@example.test`, password });
  if (error || !data.user) throw error ?? new Error('could not sign up');
  await supabase.from('profiles').insert({ id: data.user.id, username }).throwOnError();
});

afterAll(async () => {
  await supabase.auth.signOut();
});

beforeEach(async () => {
  await AsyncStorage.removeItem(APPEARANCE_STORAGE_KEY);
});

const nameColour = () => {
  const style = screen.getByText(username).props.style;
  return [style].flat(Infinity).reduce((acc: object, s) => ({ ...acc, ...(s as object) }), {}) as { color?: string };
};

it('picking Calm in Profile recolours the screen and is remembered across a remount', async () => {
  const first = await renderScreen('en', { profile: Profile }, '/profile');
  await screen.findByText(username, {}, { timeout: 8000 });
  expect(nameColour().color).toBe(palettes.light.ink);
  expect(screen.getByText('Appearance')).toBeOnTheScreen();

  fireEvent.press(screen.getByRole('button', { name: 'Calm' }));
  await waitFor(() => expect(nameColour().color).toBe(calm.ink));
  expect(screen.getByRole('button', { name: 'Calm' }).props.accessibilityState).toMatchObject({ selected: true });
  await waitFor(async () => expect(await AsyncStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe('calm'));

  first.unmount();
  await renderScreen('en', { profile: Profile }, '/profile');
  await screen.findByText(username, {}, { timeout: 8000 });
  await waitFor(() => expect(nameColour().color).toBe(calm.ink));
});

it('offers Auto, Light, Dark and Calm, in Bulgarian too', async () => {
  await renderScreen('bg', { profile: Profile }, '/profile');
  await screen.findByText(username, {}, { timeout: 8000 });
  expect(screen.getByText('Облик')).toBeOnTheScreen();
  for (const name of ['Автоматично', 'Светла', 'Тъмна', 'Спокойна']) {
    expect(screen.getByRole('button', { name })).toBeOnTheScreen();
  }
});

describe('Auto follows the phone', () => {
  const wrapper = ({ children }: { children: ReactElement }) => <AppearanceProvider>{children}</AppearanceProvider>;

  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['dark', true, palettes.dark.ground],
    ['light', false, palettes.light.ground],
  ] as const)('phone is %s', async (scheme, isDark, ground) => {
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue(scheme);
    const { result } = await renderHook(() => useTheme(), { wrapper });
    await waitFor(() => expect(result.current.c.ground).toBe(ground));
    expect(result.current.isDark).toBe(isDark);
  });

  it('a stored Calm beats the phone being dark, and Calm is not "dark"', async () => {
    await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, 'calm');
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('dark');
    const { result } = await renderHook(() => useTheme(), { wrapper });
    await waitFor(() => expect(result.current.c.ground).toBe(calm.ground));
    expect(result.current.isDark).toBe(false);
  });

  it('follows a change of the phone scheme after it has mounted', async () => {
    const scheme = jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('light');
    const { result, rerender } = await renderHook(() => useTheme(), { wrapper });
    await waitFor(() => expect(result.current.c.ground).toBe(palettes.light.ground));
    scheme.mockReturnValue('dark');
    await rerender({});
    await waitFor(() => expect(result.current.c.ground).toBe(palettes.dark.ground));
  });

  it('a stored choice that cannot be read falls back to Auto', async () => {
    // AsyncStorage is already a jest mock here: swap its implementation and put it back. Only our key fails,
    // because the Supabase client reads its session from the same storage.
    const getItem = AsyncStorage.getItem as jest.Mock;
    const real = getItem.getMockImplementation()!;
    getItem.mockImplementation((key: string) => (key === APPEARANCE_STORAGE_KEY ? Promise.reject(new Error('storage down')) : real(key)));
    try {
      jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('dark');
      const { result } = await renderHook(() => useTheme(), { wrapper });
      await waitFor(() => expect(result.current.c.ground).toBe(palettes.dark.ground));
    } finally {
      getItem.mockImplementation(real);
    }
  });

  it.each([
    ['calm', 'light'],
    ['light', 'light'],
    ['dark', 'dark'],
    ['auto', 'unspecified'],
  ] as const)('choosing %s tells the phone chrome (keyboard, alerts) %s', async (choice, scheme) => {
    const set = jest.spyOn(NativeAppearance, 'setColorScheme').mockImplementation(() => {});
    const { result } = await renderHook(() => ({ theme: useTheme(), app: useAppearance() }), { wrapper });
    await waitFor(() => expect(result.current).toBeDefined());
    await act(async () => result.current.app.setAppearance(choice));
    await waitFor(() => expect(set).toHaveBeenLastCalledWith(scheme));
  });

  it('leaves setColorScheme alone on the web (react-native-web ships one that throws)', async () => {
    const os = ReactNative.Platform.OS;
    const set = jest.spyOn(NativeAppearance, 'setColorScheme').mockImplementation(() => {
      throw new Error('NativeAppearance.default.setColorScheme is not a function');
    });
    ReactNative.Platform.OS = 'web';
    try {
      const { result } = await renderHook(() => useTheme(), { wrapper });
      await waitFor(() => expect(result.current.c.ground).toBeDefined());
      expect(set).not.toHaveBeenCalled();
    } finally {
      ReactNative.Platform.OS = os;
    }
  });

  it('keeps the same setter between renders', async () => {
    const { result, rerender } = await renderHook(() => useAppearance(), { wrapper });
    await waitFor(() => expect(result.current).toBeDefined());
    const first = result.current.setAppearance;
    await rerender({});
    expect(result.current.setAppearance).toBe(first);
  });

  it('an unreadable or unknown stored value falls back to Auto', async () => {
    await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, 'neon');
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('dark');
    const { result } = await renderHook(() => useTheme(), { wrapper });
    await waitFor(() => expect(result.current.c.ground).toBe(palettes.dark.ground));
  });
});
