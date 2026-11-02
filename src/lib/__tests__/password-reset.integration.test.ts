import { mailCount, waitForCode } from '../../../test/mail';
import { passwordLongEnough, resetPassword, sendResetCode } from '../password';
import { supabase } from '../supabase';

// Forgot password: a 6-digit code by e-mail, then a new password (no links, see
// app/reset-password.tsx). Real readers on local Supabase, real mail in its mail catcher.
const oldPassword = 'test-password-1234';
const newPassword = 'brand-new-password-5678';
const run = Date.now().toString(36);

async function signUp(name: string) {
  const email = `${name}-${run}@example.test`;
  const { data, error } = await supabase.auth.signUp({ email, password: oldPassword });
  if (error || !data.user) throw error ?? new Error(`could not sign up ${email}`);
  await supabase.auth.signOut();
  return email;
}

const signInWorks = async (email: string, password: string) => {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  await supabase.auth.signOut();
  return !error;
};

afterAll(async () => {
  await supabase.auth.signOut();
});

it('passwords need at least 8 characters', () => {
  expect(passwordLongEnough('1234567')).toBe(false);
  expect(passwordLongEnough('12345678')).toBe(true);
});

it('the e-mailed code sets a new password; the old one stops working', async () => {
  const email = await signUp('forgetful');
  expect(await sendResetCode(email)).toBe('sent');
  const code = await waitForCode(email);

  expect(await resetPassword(email, code, newPassword)).toBe('done');
  // Setting the password leaves the reader signed in, like a normal sign-in.
  expect((await supabase.auth.getSession()).data.session?.user.email).toBe(email);
  await supabase.auth.signOut();

  expect(await signInWorks(email, oldPassword)).toBe(false);
  expect(await signInWorks(email, newPassword)).toBe(true);
});

it('a wrong code changes nothing and signs nobody in', async () => {
  const email = await signUp('typo');
  expect(await sendResetCode(email)).toBe('sent');
  const code = await waitForCode(email);
  const wrong = code === '000000' ? '111111' : '000000';

  expect(await resetPassword(email, wrong, newPassword)).toBe('bad-code');
  expect((await supabase.auth.getSession()).data.session).toBeNull();
  expect(await signInWorks(email, oldPassword)).toBe(true);
  expect(await signInWorks(email, newPassword)).toBe(false);
});

it('asking again straight away is turned down as too soon', async () => {
  const email = await signUp('eager');
  expect(await sendResetCode(email)).toBe('sent');
  // One code per address per second at most (max_frequency in supabase/config.toml).
  expect(await sendResetCode(email)).toBe('rate-limited');
});

it('an unknown e-mail gets the same answer and no mail', async () => {
  const email = `nobody-${run}@example.test`;
  expect(await sendResetCode(email)).toBe('sent');
  await new Promise((resolve) => setTimeout(resolve, 1000));
  expect(await mailCount(email)).toBe(0);
});
