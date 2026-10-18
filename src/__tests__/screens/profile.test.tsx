import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import Profile from '../../../app/(tabs)/profile';
import { renderScreen } from '../../../test/router';
import { supabase } from '../../lib/supabase';

// Profile > "Help us improve the app" (docs/DECISIONS.md, "Analytics: first-party, with an opt-out"):
// on by default; off records nothing, and the choice is stored on the account.
const password = 'test-password-1234';
const run = Date.now().toString(36);
let userId = '';

beforeAll(async () => {
  const { data, error } = await supabase.auth.signUp({ email: `optout-${run}@example.test`, password });
  if (error || !data.user) throw error ?? new Error('could not sign up');
  userId = data.user.id;
  await supabase.from('profiles').insert({ id: userId, username: `optout_${run}` }).throwOnError();
});

afterAll(async () => {
  await supabase.auth.signOut();
});

const optedOut = async () =>
  (await supabase.from('analytics_opt_outs').select('user_id').eq('user_id', userId).throwOnError()).data!.length === 1;

it('the switch is on by default; turning it off is saved to the account', async () => {
  await renderScreen('en', { profile: Profile }, '/profile');
  const toggle = await screen.findByLabelText('Help us improve the app', {}, { timeout: 8000 });
  expect(screen.getByText('We count which features get used. Never what you read or write.')).toBeOnTheScreen();
  await waitFor(() => expect(toggle.props.value).toBe(true), { timeout: 8000 });
  await fireEvent(toggle, 'valueChange', false);
  await waitFor(async () => expect(await optedOut()).toBe(true), { timeout: 8000 });
  expect(screen.getByLabelText('Help us improve the app').props.value).toBe(false);
  await fireEvent(screen.getByLabelText('Help us improve the app'), 'valueChange', true);
  await waitFor(async () => expect(await optedOut()).toBe(false), { timeout: 8000 });
});

it('in Bulgarian', async () => {
  await renderScreen('bg', { profile: Profile }, '/profile');
  expect(await screen.findByLabelText('Помогни ни да подобрим приложението', {}, { timeout: 8000 })).toBeOnTheScreen();
  expect(screen.getByText('Броим кои функции се използват. Никога какво четеш или пишеш.')).toBeOnTheScreen();
});
