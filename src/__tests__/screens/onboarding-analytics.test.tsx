import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import Onboarding from '../../../app/onboarding';
import { renderScreen } from '../../../test/router';
import { serviceClient } from '../../../test/service';
import { MIN_AGE } from '../../lib/legal';
import { supabase } from '../../lib/supabase';

// Analytics are opt-in (docs/DECISIONS.md, "Analytics: opt-in", 14 Nov 2026): a third box at onboarding,
// unticked and not needed to start. Ticking it records consent once the profile exists; only then are
// the first events (sign_up, onboarding_done) sent. Real readers on local Supabase.
const password = 'test-password-1234';
const run = Date.now().toString(36);
const LABEL = 'Help us improve the app: count which features get used. Never what you read or write.';
const service = serviceClient();

async function signUp(name: string) {
  await supabase.auth.signOut();
  const { data, error } = await supabase.auth.signUp({ email: `${name}-${run}@example.test`, password });
  if (error || !data.user) throw error ?? new Error('could not sign up');
  return { id: data.user.id, username: `${name}_${run}` };
}

const consented = async (id: string) =>
  (await service.from('analytics_consents').select('user_id').eq('user_id', id).throwOnError()).data!.length === 1;
const events = async (id: string) =>
  (await service.from('analytics_events').select('name').eq('user_id', id).order('id').throwOnError()).data!.map((e) => e.name);
const profileExists = async (id: string) =>
  (await service.from('profiles').select('id').eq('id', id).throwOnError()).data!.length === 1;

async function fillIn(username: string) {
  await renderScreen('en', { onboarding: Onboarding }, '/onboarding');
  await fireEvent.changeText(await screen.findByLabelText('Name', {}, { timeout: 8000 }), username);
  await fireEvent.press(screen.getByRole('checkbox', { name: /accept/ }));
  await fireEvent.press(screen.getByRole('checkbox', { name: new RegExp(`at least ${MIN_AGE}`) }));
}

afterAll(async () => {
  await supabase.auth.signOut();
});

it('the analytics box is unticked by default and not needed to start; nothing is recorded', async () => {
  const u = await signUp('noconsent');
  await fillIn(u.username);
  const box = screen.getByRole('checkbox', { name: LABEL });
  expect(box).not.toBeChecked();
  const start = screen.getByRole('button', { name: 'Start reading' });
  expect(start).toBeEnabled();
  await fireEvent.press(start);
  await waitFor(async () => expect(await profileExists(u.id)).toBe(true), { timeout: 8000 });
  // Give any stray event time to arrive before checking that none did.
  await new Promise((resolve) => setTimeout(resolve, 500));
  expect(await consented(u.id)).toBe(false);
  expect(await events(u.id)).toEqual([]);
});

it('ticking it records consent after the profile, and then the first events', async () => {
  const u = await signUp('consent');
  await fillIn(u.username);
  await fireEvent.press(screen.getByRole('checkbox', { name: LABEL }));
  expect(screen.getByRole('checkbox', { name: LABEL })).toBeChecked();
  await fireEvent.press(screen.getByRole('button', { name: 'Start reading' }));
  await waitFor(async () => expect(await consented(u.id)).toBe(true), { timeout: 8000 });
  await waitFor(async () => expect(await events(u.id)).toEqual(['sign_up', 'onboarding_done']), { timeout: 8000 });
});

it('in Bulgarian', async () => {
  await signUp('bgconsent');
  await renderScreen('bg', { onboarding: Onboarding }, '/onboarding');
  expect(
    await screen.findByRole(
      'checkbox',
      { name: 'Помогни ни да подобрим приложението: да броим кои функции се използват. Никога какво четеш или пишеш.' },
      { timeout: 8000 },
    ),
  ).not.toBeChecked();
});
