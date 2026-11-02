import { act, fireEvent, screen } from '@testing-library/react-native';
import { Slot } from 'expo-router';
import { Text } from 'react-native';

import { RootStack } from '../../../app/_layout';
import ResetPassword from '../../../app/reset-password';
import SignIn from '../../../app/sign-in';
import { mailCount, waitForCode } from '../../../test/mail';
import { holdRequest } from '../../../test/network';
import { renderScreen } from '../../../test/router';
import { supabase } from '../../lib/supabase';

// Forgot password (app/reset-password.tsx): a 6-digit code by e-mail, then a new password.
// Through the real root stack, so the screen is only reachable signed out, as in the app.
// Real readers on local Supabase, real mail read from its mail catcher.
const oldPassword = 'test-password-1234';
const newPassword = 'brand-new-password-5678';
const run = Date.now().toString(36);

// Readers without a profile: once signed in they land on onboarding, a plain stand-in here.
async function signUp(name: string) {
  const email = `${name}-${run}@example.test`;
  const { data, error } = await supabase.auth.signUp({ email, password: oldPassword });
  if (error || !data.user) throw error ?? new Error(`could not sign up ${email}`);
  await supabase.auth.signOut();
  return email;
}

const routes = {
  _layout: RootStack,
  'sign-in': SignIn,
  'reset-password': ResetPassword,
  onboarding: () => <Text>onboarding screen</Text>,
  '(tabs)/_layout': () => <Slot />,
  '(tabs)/index': () => <Text>home screen</Text>,
};

const neutral = 'If an account exists for this email, we’ve sent a 6-digit code.';

async function askForCode(email: string) {
  await renderScreen('en', routes, '/reset-password');
  await fireEvent.changeText(await screen.findByLabelText('Email', {}, { timeout: 8000 }), email);
  await fireEvent.press(screen.getByText('Send code'));
  expect(await screen.findByText(neutral)).toBeOnTheScreen();
}

async function enter(code: string, password: string) {
  await fireEvent.changeText(screen.getByLabelText('Code from the email'), code);
  await fireEvent.changeText(screen.getByLabelText('New password'), password);
  await fireEvent.press(screen.getByText('Set new password'));
}

const signInWorks = async (email: string, password: string) => {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  await supabase.auth.signOut();
  return !error;
};

afterEach(async () => {
  await supabase.auth.signOut();
});

it('"Forgot password?" on sign-in (sign-in mode only) opens the reset screen with the email', async () => {
  await renderScreen('en', routes, '/sign-in');
  expect(await screen.findByText('Forgot password?', {}, { timeout: 8000 })).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('New here? Create an account'));
  expect(screen.queryByText('Forgot password?')).toBeNull();
  await fireEvent.press(screen.getByText('Already have an account? Sign in'));

  await fireEvent.changeText(screen.getByLabelText('Email'), `reader-${run}@example.test`);
  await fireEvent.press(screen.getByText('Forgot password?'));
  expect(await screen.findByText('Reset your password')).toBeOnTheScreen();
  expect(screen.getByLabelText('Email').props.value).toBe(`reader-${run}@example.test`);
});

it('the code from the email sets a new password; the screen stays until it is set', async () => {
  const email = await signUp('forgot');
  await askForCode(email);
  const code = await waitForCode(email);

  // Hold back setting the password: the code has signed the reader in by then, and without the
  // guard the root stack would already have swapped the reset screen for the app.
  let reached = false;
  const update = holdRequest((url) => (reached ||= url.endsWith('/auth/v1/user')));
  await fireEvent.changeText(screen.getByLabelText('Code from the email'), code);
  await fireEvent.changeText(screen.getByLabelText('New password'), newPassword);
  // Not awaited: the press only settles once the held request is answered.
  const pressed = fireEvent.press(screen.getByText('Set new password'));
  for (let waited = 0; !reached; waited += 50) {
    if (waited > 10_000) throw new Error('the new password was never sent');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  // Let the sign-in from the code reach the root stack (profile load included).
  await new Promise((resolve) => setTimeout(resolve, 1000));
  expect(screen.getByText('Reset your password')).toBeOnTheScreen();
  expect(screen.queryByText('onboarding screen')).toBeNull();

  update.release();
  await pressed;
  expect(await screen.findByText('onboarding screen')).toBeOnTheScreen();
  expect((await supabase.auth.getSession()).data.session?.user.email).toBe(email);
  await supabase.auth.signOut();
  expect(await signInWorks(email, oldPassword)).toBe(false);
  expect(await signInWorks(email, newPassword)).toBe(true);
});

it('an unknown email gets the same message, and no mail is sent', async () => {
  const email = `nobody-${run}@example.test`;
  await askForCode(email);
  expect(screen.getByLabelText('Code from the email')).toBeOnTheScreen();
  expect(await mailCount(email)).toBe(0);

  // Back to the email step, to fix a typo in the address.
  await fireEvent.press(screen.getByText('Back'));
  expect(screen.getByText('Send code')).toBeOnTheScreen();
  expect(screen.queryByLabelText('Code from the email')).toBeNull();
  expect(screen.getByLabelText('Email').props.value).toBe(email);
});

it('a short password or a malformed code is caught before anything is sent', async () => {
  await askForCode(`checks-${run}@example.test`);
  const verify = jest.spyOn(supabase.auth, 'verifyOtp');
  try {
    await enter('123456', 'short');
    expect(screen.getByText('Your password needs at least 8 characters.')).toBeOnTheScreen();
    await enter('12a4', newPassword);
    expect(screen.getByText('Enter the 6-digit code from the email.')).toBeOnTheScreen();
    expect(verify).not.toHaveBeenCalled();
  } finally {
    verify.mockRestore();
  }
});

it('a wrong code shows an error and stays on the screen, signed out', async () => {
  const email = await signUp('wrongcode');
  await askForCode(email);
  const code = await waitForCode(email);
  await enter(code === '000000' ? '111111' : '000000', newPassword);
  expect(await screen.findByText('That code is wrong or has expired. Check the email, or send a new code.')).toBeOnTheScreen();
  expect(screen.getByText('Reset your password')).toBeOnTheScreen();
  expect((await supabase.auth.getSession()).data.session).toBeNull();
  expect(await signInWorks(email, oldPassword)).toBe(true);
});

it('"Send a new code" sends another code, and that one works', async () => {
  const email = await signUp('resend');
  await askForCode(email);
  await waitForCode(email);
  // Supabase sends one code per address per second at most (max_frequency in supabase/config.toml).
  await act(() => new Promise((resolve) => setTimeout(resolve, 1100)));
  await fireEvent.press(screen.getByText('Send a new code'));
  const fresh = await waitForCode(email, 1);
  await enter(fresh, newPassword);
  expect(await screen.findByText('onboarding screen')).toBeOnTheScreen();
});

it('in Bulgarian', async () => {
  await renderScreen('bg', routes, '/reset-password');
  expect(await screen.findByText('Смени паролата си', {}, { timeout: 8000 })).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('Имейл'), `bg-${run}@example.test`);
  await fireEvent.press(screen.getByText('Изпрати код'));
  expect(await screen.findByText('Ако има акаунт с този имейл, изпратихме ти 6-цифрен код.')).toBeOnTheScreen();
  expect(screen.getByLabelText('Код от имейла')).toBeOnTheScreen();
  expect(screen.getByLabelText('Нова парола')).toBeOnTheScreen();
});
