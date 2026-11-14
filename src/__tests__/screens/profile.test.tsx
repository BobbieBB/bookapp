import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import Profile from '../../../app/(tabs)/profile';
import { failRequests, holdRequest } from '../../../test/network';
import { renderScreen } from '../../../test/router';
import * as analytics from '../../lib/analytics';
import { PRIVACY_URL, TERMS_URL } from '../../lib/legal';
import { supabase } from '../../lib/supabase';

// Profile > "Help us improve the app" (docs/DECISIONS.md, "Analytics: opt-in", 14 Nov 2026): off until the
// reader turns it on; on stores consent on the account, off deletes it.
const password = 'test-password-1234';
const run = Date.now().toString(36);
let userId = '';

beforeAll(async () => {
  const { data, error } = await supabase.auth.signUp({ email: `consent-${run}@example.test`, password });
  if (error || !data.user) throw error ?? new Error('could not sign up');
  userId = data.user.id;
  await supabase.from('profiles').insert({ id: userId, username: `consent_${run}` }).throwOnError();
});

afterAll(async () => {
  await supabase.auth.signOut();
});

const consented = async () =>
  (await supabase.from('analytics_consents').select('user_id').eq('user_id', userId).throwOnError()).data!.length === 1;

it('the switch is off by default; turning it on stores consent, turning it off deletes it', async () => {
  await renderScreen('en', { profile: Profile }, '/profile');
  const toggle = await screen.findByLabelText('Help us improve the app', {}, { timeout: 8000 });
  expect(screen.getByText('We count which features get used. Never what you read or write.')).toBeOnTheScreen();
  await waitFor(() => expect(screen.getByLabelText('Help us improve the app')).toBeEnabled(), { timeout: 8000 });
  expect(toggle.props.value).toBe(false);
  await fireEvent(toggle, 'valueChange', true);
  await waitFor(async () => expect(await consented()).toBe(true), { timeout: 8000 });
  // Saved first, then the screen reloads the choice: wait for that reload to show it.
  await waitFor(() => expect(screen.getByLabelText('Help us improve the app').props.value).toBe(true), { timeout: 8000 });
  await fireEvent(screen.getByLabelText('Help us improve the app'), 'valueChange', false);
  await waitFor(async () => expect(await consented()).toBe(false), { timeout: 8000 });
  await waitFor(() => expect(screen.getByLabelText('Help us improve the app').props.value).toBe(false), { timeout: 8000 });
});

const saveUrl = (url: string) => url.includes('/rest/v1/analytics_consents') && !url.includes('select=');

it('the switch cannot be used while a save is on its way', async () => {
  await renderScreen('en', { profile: Profile }, '/profile');
  await waitFor(() => expect(screen.getByLabelText('Help us improve the app')).toBeEnabled(), { timeout: 8000 });
  const save = holdRequest(saveUrl);
  try {
    await fireEvent(screen.getByLabelText('Help us improve the app'), 'valueChange', true);
    await waitFor(() => expect(screen.getByLabelText('Help us improve the app')).toBeDisabled(), { timeout: 3000 });
  } finally {
    save.release();
  }
  await waitFor(() => expect(screen.getByLabelText('Help us improve the app')).toBeEnabled(), { timeout: 8000 });
  expect(screen.getByLabelText('Help us improve the app').props.value).toBe(true);
  await fireEvent(screen.getByLabelText('Help us improve the app'), 'valueChange', false);
  await waitFor(async () => expect(await consented()).toBe(false), { timeout: 8000 });
});

it('a failed save says so and shows the real value', async () => {
  await renderScreen('en', { profile: Profile }, '/profile');
  await waitFor(() => expect(screen.getByLabelText('Help us improve the app')).toBeEnabled(), { timeout: 8000 });
  const online = failRequests((url, method) => saveUrl(url) && method !== 'GET');
  try {
    await fireEvent(screen.getByLabelText('Help us improve the app'), 'valueChange', true);
    expect(await screen.findByText('Could not save this choice. Please try again.', {}, { timeout: 8000 })).toBeOnTheScreen();
  } finally {
    online();
  }
  await waitFor(() => expect(screen.getByLabelText('Help us improve the app')).toBeEnabled(), { timeout: 8000 });
  expect(screen.getByLabelText('Help us improve the app').props.value).toBe(false);
  expect(await consented()).toBe(false);
});

it('in Bulgarian', async () => {
  await renderScreen('bg', { profile: Profile }, '/profile');
  expect(await screen.findByLabelText('Помогни ни да подобрим приложението', {}, { timeout: 8000 })).toBeOnTheScreen();
  expect(screen.getByText('Броим кои функции се използват. Никога какво четеш или пишеш.')).toBeOnTheScreen();
});

it('while the choice cannot be read, the switch is disabled rather than shown off', async () => {
  const lookup = jest.spyOn(analytics, 'analyticsConsent').mockRejectedValue(new Error('offline'));
  try {
    await renderScreen('en', { profile: Profile }, '/profile');
    expect(await screen.findByText('Could not save this choice. Please try again.', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.getByLabelText('Help us improve the app')).toBeDisabled();
  } finally {
    lookup.mockRestore();
  }
});

it('the terms and the privacy policy open from Profile, and a failure says so', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockRejectedValueOnce(new Error('no browser')).mockResolvedValue(true);
  await renderScreen('bg', { profile: Profile }, '/profile');
  fireEvent.press(await screen.findByRole('button', { name: 'Условия' }, { timeout: 8000 }));
  expect(open).toHaveBeenLastCalledWith(TERMS_URL);
  expect(await screen.findByText('Не успяхме да отворим страницата. Опитай пак.')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Политика за поверителност' }));
  expect(open).toHaveBeenLastCalledWith(PRIVACY_URL);
  await waitFor(() => expect(screen.queryByText('Не успяхме да отворим страницата. Опитай пак.')).toBeNull());
  open.mockRestore();
});
