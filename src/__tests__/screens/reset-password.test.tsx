import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router, Slot } from 'expo-router';
import { Text } from 'react-native';

import { RootStack } from '../../../app/_layout';
import ResetPassword from '../../../app/reset-password';
import SignIn from '../../../app/sign-in';
import { mailCount, noMailWithin, waitForCode } from '../../../test/mail';
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

const neutral =
  'If an account exists for this email, we’ve sent a 6-digit code. It can take a minute; after that you can ask for a new one.';
const codeSpent = 'We couldn’t save your new password, and that code is now used up. Please ask for a new one.';

/** Opens the reset screen (directly, or from sign-in so there is a screen to go back to) and asks for a code. */
async function askForCode(email: string, from: '/reset-password' | '/sign-in' = '/reset-password') {
  await renderScreen('en', routes, from);
  await fireEvent.changeText(await screen.findByLabelText('Email', {}, { timeout: 8000 }), email);
  if (from === '/sign-in') await fireEvent.press(screen.getByText('Forgot password?'));
  await fireEvent.press(await screen.findByText('Send code'));
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

async function within<T>(promise: Promise<T>, what: string, ms = 10_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(`no ${what} within ${ms} ms`)), ms)));
  try {
    return await Promise.race([promise, late]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Presses "Set new password" with that request held back. By then the code has signed the reader
 * in; this resolves once the root stack has had that sign-in (its profile load answered), so a
 * missing guard would show. Returns the release and the pending press.
 */
async function setPasswordHeld(code: string) {
  let reached!: () => void;
  const sent = new Promise<void>((resolve) => (reached = resolve));
  const update = holdRequest((url) => url.endsWith('/auth/v1/user') && (reached(), true));
  const profile = holdRequest((url) => url.includes('/rest/v1/profiles'));
  profile.release(); // not held, only watched
  await fireEvent.changeText(screen.getByLabelText('Code from the email'), code);
  await fireEvent.changeText(screen.getByLabelText('New password'), newPassword);
  // Not awaited: the press only settles once the held request is answered.
  const pressed = fireEvent.press(screen.getByText('Set new password'));
  await within(sent, 'request to set the password');
  await within(profile.answer, 'profile load after the code signed in');
  await new Promise((resolve) => setTimeout(resolve, 50)); // let React render that answer
  return { release: update.release, pressed };
}

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

it('the code from the email (pasted with a space) sets a new password; the screen stays until it is set', async () => {
  const email = await signUp('forgot');
  await askForCode(email);
  expect(screen.getByText(`Type the code from the email to ${email}, then choose a new password.`)).toBeOnTheScreen();
  const code = await waitForCode(email);

  const held = await setPasswordHeld(`${code.slice(0, 3)} ${code.slice(3)}`);
  expect(screen.getByText('Reset your password')).toBeOnTheScreen();
  expect(screen.queryByText('onboarding screen')).toBeNull();

  held.release();
  await held.pressed;
  expect(await screen.findByText('onboarding screen')).toBeOnTheScreen();
  expect((await supabase.auth.getSession()).data.session?.user.email).toBe(email);
  await supabase.auth.signOut();
  expect(await signInWorks(email, oldPassword)).toBe(false);
  expect(await signInWorks(email, newPassword)).toBe(true);
});

it('going back while the password is being set neither leaves the screen nor skips into the app', async () => {
  const email = await signUp('leaver');
  await askForCode(email, '/sign-in');
  const code = await waitForCode(email);

  const held = await setPasswordHeld(code);
  await fireEvent.press(screen.getByText('Back')); // disabled while busy
  await act(() => router.back()); // the hardware back button / back gesture
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(screen.getByText('Reset your password')).toBeOnTheScreen();
  expect(screen.queryByText('onboarding screen')).toBeNull();

  held.release();
  await held.pressed;
  expect(await screen.findByText('onboarding screen')).toBeOnTheScreen();
  await supabase.auth.signOut();
  expect(await signInWorks(email, newPassword)).toBe(true);
});

it('a known and an unknown email look exactly the same, even when asking again straight away', async () => {
  const known = await signUp('known');
  const unknown = `nobody-${run}@example.test`;
  const shown: string[] = [];
  for (const email of [known, unknown]) {
    await askForCode(email);
    // Supabase turns down a second request this soon, but only for an address with an account.
    await fireEvent.press(screen.getByText('Send a new code'));
    expect(await screen.findByText(neutral)).toBeOnTheScreen();
    // Everything the reader sees; the navigator's random screen id aside.
    shown.push(JSON.stringify(screen.toJSON()).replaceAll(email, '<email>').replace(/"screenId":"[^"]*"/g, ''));
    screen.unmount();
  }
  expect(shown[1] === shown[0]).toBe(true); // a full diff would print the whole screen
  await waitForCode(known); // the control: mail does arrive in this window
  expect(await noMailWithin(unknown)).toBe(true);
});

it('Back on the code step returns to the email step, to fix a typo', async () => {
  const email = `typo-${run}@example.test`;
  await askForCode(email);
  await fireEvent.press(screen.getByText('Back'));
  expect(screen.getByText('Send code')).toBeOnTheScreen();
  expect(screen.queryByLabelText('Code from the email')).toBeNull();
  expect(screen.getByLabelText('Email').props.value).toBe(email);
});

it('server errors when asking for a code are shown in the app’s words, never the server’s', async () => {
  await renderScreen('en', routes, '/reset-password');
  await fireEvent.changeText(await screen.findByLabelText('Email', {}, { timeout: 8000 }), '@');
  await fireEvent.press(screen.getByText('Send code'));
  expect(await screen.findByText('Please enter your email address.')).toBeOnTheScreen();
  expect(screen.queryByText(/Unable to validate/)).toBeNull();

  const send = jest
    .spyOn(supabase.auth, 'resetPasswordForEmail')
    .mockResolvedValueOnce({ data: null, error: new AuthApiError('Database exploded', 500, 'unexpected_failure') });
  try {
    await fireEvent.changeText(screen.getByLabelText('Email'), `boom-${run}@example.test`);
    await fireEvent.press(screen.getByText('Send code'));
    expect(await screen.findByText('We couldn’t reach the server. Check your connection and try again.')).toBeOnTheScreen();
    expect(screen.queryByText(/exploded/)).toBeNull();
  } finally {
    send.mockRestore();
  }
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

it('a wrong code shows an error (and no "code sent") and stays on the screen, signed out', async () => {
  const email = await signUp('wrongcode');
  await askForCode(email);
  const code = await waitForCode(email);
  await enter(code === '000000' ? '111111' : '000000', newPassword);
  expect(await screen.findByText('That code is wrong or has expired. Check the email, or send a new code.')).toBeOnTheScreen();
  expect(screen.queryByText(neutral)).toBeNull();
  expect(screen.getByLabelText('Code from the email')).toBeOnTheScreen();
  expect((await supabase.auth.getSession()).data.session).toBeNull();
  expect(await signInWorks(email, oldPassword)).toBe(true);
});

it('the old password as the new one: says so, signs out and asks for a new code', async () => {
  const email = await signUp('samepw');
  await askForCode(email);
  await enter(await waitForCode(email), oldPassword);
  expect(
    await screen.findByText('Your new password must be different from the old one. That code is now used up, so please ask for a new one.'),
  ).toBeOnTheScreen();
  expect(screen.getByText('Send code')).toBeOnTheScreen();
  expect(screen.queryByText('onboarding screen')).toBeNull();
  expect((await supabase.auth.getSession()).data.session).toBeNull();
});

it('any other failure once the code is accepted: the code is used up, signed out, back to the email step', async () => {
  const email = await signUp('offline');
  await askForCode(email);
  const code = await waitForCode(email);
  // Fault injection: the connection drops just as the new password is sent.
  const update = jest
    .spyOn(supabase.auth, 'updateUser')
    .mockResolvedValueOnce({ data: { user: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) });
  try {
    await enter(code, newPassword);
    expect(await screen.findByText(codeSpent)).toBeOnTheScreen();
  } finally {
    update.mockRestore();
  }
  expect(screen.queryByText(/Failed to fetch/)).toBeNull();
  expect(screen.getByText('Send code')).toBeOnTheScreen();
  expect(screen.queryByText('onboarding screen')).toBeNull();
  expect((await supabase.auth.getSession()).data.session).toBeNull();
  expect(await signInWorks(email, oldPassword)).toBe(true);
});

it('"Send a new code" sends another code, and that one works', async () => {
  const email = await signUp('resend');
  await askForCode(email);
  await waitForCode(email);
  // Supabase sends one code per address per second at most (max_frequency in supabase/config.toml):
  // ask until the second e-mail comes.
  for (let tries = 0; (await mailCount(email)) < 2; tries++) {
    if (tries > 20) throw new Error('no second code arrived');
    await fireEvent.press(screen.getByText('Send a new code'));
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  await enter(await waitForCode(email, 1), newPassword);
  expect(await screen.findByText('onboarding screen')).toBeOnTheScreen();
});

it('in Bulgarian', async () => {
  await renderScreen('bg', routes, '/reset-password');
  expect(await screen.findByText('Смени паролата си', {}, { timeout: 8000 })).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('Имейл'), `bg-${run}@example.test`);
  await fireEvent.press(screen.getByText('Изпрати код'));
  expect(
    await screen.findByText('Ако има акаунт с този имейл, изпратихме ти 6-цифрен код. Може да отнеме минута; след това можеш да поискаш нов.'),
  ).toBeOnTheScreen();
  expect(screen.getByText(`Въведи кода от имейла до bg-${run}@example.test и избери нова парола.`)).toBeOnTheScreen();
  expect(screen.getByLabelText('Код от имейла')).toBeOnTheScreen();
  expect(screen.getByLabelText('Нова парола')).toBeOnTheScreen();
});
