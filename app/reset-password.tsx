import { router, Stack, useLocalSearchParams } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ErrorText, Field, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { passwordLongEnough, resetPassword, sendResetCode } from '@/lib/password';
import { useT } from '@/i18n';
import { space, useTheme } from '@/theme';

// Forgot password: the reader asks for a 6-digit code by email, then types it here with a new
// password. A code instead of a link, because the app has no deep links (src/lib/password.ts).
// The screen never says whether an account exists for the address, and never shows the
// server's own error text.
export default function ResetPassword() {
  const { c } = useTheme();
  const t = useT();
  const { setRecovering } = useAuth();
  const params = useLocalSearchParams<{ email?: string }>();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // No leaving while a request runs (back gesture, Android back): a reset in flight must finish
  // on this screen, which then clears `recovering`.
  usePreventRemove(busy, () => undefined);

  async function send() {
    setError('');
    setNotice('');
    if (!email.includes('@')) return setError(t('auth.errorEmail'));
    setBusy(true);
    try {
      const result = await sendResetCode(email);
      if (result === 'bad-email') return setError(t('auth.errorEmail'));
      if (result === 'failed') return setError(t('auth.errorNetwork'));
      setNotice(t('auth.codeSent'));
      setStep('code');
    } catch {
      setError(t('auth.errorNetwork'));
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setError('');
    setNotice('');
    if (!/^\d{6}$/.test(code.trim())) return setError(t('auth.errorCode'));
    if (!passwordLongEnough(password)) return setError(t('auth.errorPasswordShort'));
    setBusy(true);
    setRecovering(true);
    try {
      const result = await resetPassword(email, code, password);
      // 'done': clearing `recovering` below sends the now signed-in reader into the app.
      if (result === 'bad-code') setError(t('auth.errorBadCode'));
      else if (result === 'rate-limited') setError(t('auth.errorRateLimit'));
      else if (result === 'failed') setError(t('auth.errorNetwork'));
      else if (result === 'same-password' || result === 'code-spent') {
        // The code is used up and the reader signed out again: start over with a new one.
        setError(t(result === 'same-password' ? 'auth.errorSamePassword' : 'auth.errorCodeSpent'));
        setStep('email');
        setCode('');
        setPassword('');
      }
    } catch {
      setError(t('auth.errorNetwork'));
    } finally {
      setBusy(false);
      setRecovering(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.band }}>
      <Stack.Screen options={{ gestureEnabled: !busy }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.l, flexGrow: 1, justifyContent: 'center' }}>
          <View style={{ gap: space.s, marginBottom: space.m }}>
            <T v="h1">{t('auth.resetTitle')}</T>
            <T>{step === 'email' ? t('auth.resetIntro') : t('auth.codeIntro', { email: email.trim() })}</T>
          </View>

          {step === 'email' ? (
            <Field
              label={t('auth.email')}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder={t('auth.emailPlaceholder')}
            />
          ) : (
            <>
              {notice ? <T style={{ color: c.success }}>{notice}</T> : null}
              <Field
                label={t('auth.code')}
                value={code}
                // Pasted codes often come with spaces or dashes ("123 456").
                onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                placeholder={t('auth.codePlaceholder')}
              />
              <Field
                label={t('auth.newPassword')}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
                placeholder={t('auth.passwordPlaceholder')}
              />
            </>
          )}

          <ErrorText>{error}</ErrorText>

          {step === 'email' ? (
            <>
              <Button title={t('auth.sendCode')} onPress={send} loading={busy} />
              <Button
                variant="link"
                title={t('auth.back')}
                disabled={busy}
                onPress={() => (router.canGoBack() ? router.back() : router.replace('/sign-in'))}
              />
            </>
          ) : (
            <>
              <Button title={t('auth.setNewPassword')} onPress={reset} loading={busy} />
              <Button variant="link" title={t('auth.sendNewCode')} onPress={send} disabled={busy} />
              <Button
                variant="link"
                title={t('auth.back')}
                disabled={busy}
                onPress={() => {
                  setStep('email');
                  setError('');
                  setNotice('');
                }}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
