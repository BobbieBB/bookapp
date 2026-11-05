import { noMailWithin, waitForCode } from '../../../test/mail';
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

it('a known and an unknown address get the same answer, however quickly they ask again', async () => {
  const known = await signUp('eager');
  const unknown = `nobody-${run}@example.test`;
  // Asking twice in a row trips Supabase's per-address limit for the known address only;
  // the app must not let that difference show.
  const answers = [];
  for (const email of [known, unknown, known, unknown]) answers.push(await sendResetCode(email));
  expect(answers).toEqual(['sent', 'sent', 'sent', 'sent']);
  await waitForCode(known); // the control: mail does arrive in this window
  expect(await noMailWithin(unknown)).toBe(true);
});

it('an address the server rejects is "bad-email", not its raw error', async () => {
  expect(await sendResetCode('@')).toBe('bad-email');
});

it('a new password the server refuses spends the code and signs the reader out', async () => {
  const email = await signUp('weak');
  await sendResetCode(email);
  const code = await waitForCode(email);
  // 6 is the server's own minimum (supabase/config.toml); the app asks for 8 before sending.
  expect(await resetPassword(email, code, 'tiny')).toBe('code-spent');
  expect((await supabase.auth.getSession()).data.session).toBeNull();
  expect(await resetPassword(email, code, newPassword)).toBe('bad-code');
  expect(await signInWorks(email, oldPassword)).toBe(true);
});

it('the old password as the new one is "same-password", and signs the reader out', async () => {
  const email = await signUp('same');
  await sendResetCode(email);
  const code = await waitForCode(email);
  expect(await resetPassword(email, code, oldPassword)).toBe('same-password');
  expect((await supabase.auth.getSession()).data.session).toBeNull();
});
