import { isAuthError, type AuthError } from '@supabase/supabase-js';

import { supabase } from './supabase';

// Passwords and resetting a forgotten one. The reset is a 6-digit code by e-mail, typed into the
// app, never a link: the app has no deep-link handling, and a code works on any phone.

const MIN_PASSWORD_LENGTH = 8;

/** The one password rule, for signing up and for a new password alike. */
export function passwordLongEnough(password: string) {
  return password.length >= MIN_PASSWORD_LENGTH;
}

const rateLimited = (error: AuthError) =>
  error.status === 429 || error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit';

/**
 * Asks for a reset code. 'sent' does not mean the account exists: Supabase answers the same for
 * unknown addresses, and so does the app. Its per-address limit only trips for addresses that
 * have an account, so being turned down for asking too soon is 'sent' as well: the code from
 * the first request is on its way. 'failed' is anything else (offline, say); never show the
 * server's own message, it is English and can name the reason.
 */
export async function sendResetCode(email: string): Promise<'sent' | 'bad-email' | 'failed'> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  if (!error || rateLimited(error)) return 'sent';
  if (error.code === 'validation_failed' || error.code === 'email_address_invalid') return 'bad-email';
  return 'failed';
}

export type ResetResult = 'done' | 'bad-code' | 'rate-limited' | 'failed' | 'code-spent' | 'same-password';

/**
 * Checks the code, which signs the reader in, then sets the new password. While this runs the
 * caller must hold the auth context's `recovering`, or the app leaves the reset screen as soon
 * as the code signs the reader in.
 * - 'bad-code' / 'rate-limited' / 'failed': the code was not accepted; it may be tried again.
 * - 'code-spent' / 'same-password': the code was accepted but the password could not be set
 *   (refused, offline, server error). The code is used up, so the reader is signed out again
 *   and needs a new one.
 */
export async function resetPassword(email: string, code: string, password: string): Promise<ResetResult> {
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'recovery' });
  if (error) {
    if (rateLimited(error)) return 'rate-limited';
    if (error.code === 'otp_expired') return 'bad-code';
    return 'failed';
  }
  const updateError = await supabase.auth.updateUser({ password }).then(
    (result) => result.error,
    (thrown: unknown) => thrown,
  );
  if (!updateError) return 'done';
  // Only this phone: other phones the reader is signed in on are not affected by a failed reset.
  // If even this fails (offline), the reader stays signed in: they have shown they own the
  // address (docs/DECISIONS.md, "Forgot password").
  await supabase.auth.signOut({ scope: 'local' });
  return isAuthError(updateError) && updateError.code === 'same_password' ? 'same-password' : 'code-spent';
}
