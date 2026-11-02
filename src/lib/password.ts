import type { AuthError } from '@supabase/supabase-js';

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
 * unknown addresses, and so must the app. Other failures (offline, say) throw.
 */
export async function sendResetCode(email: string): Promise<'sent' | 'rate-limited'> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  if (!error) return 'sent';
  if (rateLimited(error)) return 'rate-limited';
  throw error;
}

export type ResetResult = 'done' | 'bad-code' | 'rate-limited' | 'same-password';

/**
 * Checks the code, which signs the reader in, then sets the new password. While this runs the
 * caller must hold the auth context's `recovering`, or the app leaves the reset screen as soon
 * as the code signs the reader in. If the password cannot be set, the reader is signed out again:
 * the code is spent, and an account they cannot sign back into is no use to them.
 */
export async function resetPassword(email: string, code: string, password: string): Promise<ResetResult> {
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'recovery' });
  if (error) {
    if (rateLimited(error)) return 'rate-limited';
    if (error.code === 'otp_expired') return 'bad-code';
    throw error;
  }
  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (!updateError) return 'done';
  // Only this phone: other phones the reader is signed in on are not affected by a failed reset.
  await supabase.auth.signOut({ scope: 'local' });
  if (updateError.code === 'same_password') return 'same-password';
  throw updateError;
}
