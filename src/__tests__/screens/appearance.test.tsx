import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderHook, screen, waitFor } from '@testing-library/react-native';
import * as ReactNative from 'react-native';
import type { ReactElement } from 'react';

import Profile from '../../../app/(tabs)/profile';
import { renderScreen } from '../../../test/router';
import { AppearanceProvider, APPEARANCE_STORAGE_KEY } from '../../appearance';
import { supabase } from '../../lib/supabase';
import { palettes, useTheme } from '../../theme';

// Profile > Appearance (docs/DECISIONS.md, "Calm theme"): Auto · Light · Dark · Calm, remembered per device.
const password = 'test-password-1234';
const run = Date.now().toString(36);
const username = `calm_${run}`;
const calm = (palettes as Record<string, (typeof palettes)['light']>).calm!;

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

  it('an unreadable or unknown stored value falls back to Auto', async () => {
    await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, 'neon');
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('dark');
    const { result } = await renderHook(() => useTheme(), { wrapper });
    await waitFor(() => expect(result.current.c.ground).toBe(palettes.dark.ground));
  });
});
