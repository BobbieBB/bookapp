import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ErrorText, Field, T } from '@/components/ui';
import { APP_NAME } from '@/lib/config';
import { supabase } from '@/lib/supabase';
import { useT } from '@/i18n';
import { space, useTheme } from '@/theme';

export default function SignIn() {
  const { c } = useTheme();
  const t = useT();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit() {
    setError('');
    setNotice('');
    if (!email.includes('@')) return setError(t('auth.errorEmail'));
    if (password.length < 8) return setError(t('auth.errorPasswordShort'));

    setBusy(true);
    try {
      if (mode === 'sign-in') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) setError(friendly(error.message, t));
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) setError(friendly(error.message, t));
        else if (!data.session) {
          // Email confirmation is switched on in Supabase: the user must click the link first.
          setNotice(t('auth.confirmNotice'));
          setMode('sign-in');
        }
      }
    } catch {
      setError(t('auth.errorNetwork'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.band }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.l, flexGrow: 1, justifyContent: 'center' }}>
          <View style={{ gap: space.s, marginBottom: space.m }}>
            <T v="overline">{APP_NAME.toUpperCase()}</T>
            <T v="h1">{mode === 'sign-in' ? t('auth.welcomeBack') : t('auth.joinReaders')}</T>
            <T>{t('auth.intro')}</T>
          </View>

          <Field
            label={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder={t('auth.emailPlaceholder')}
          />
          <Field
            label={t('auth.password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            placeholder={t('auth.passwordPlaceholder')}
          />

          <ErrorText>{error}</ErrorText>
          {notice ? <T style={{ color: c.success }}>{notice}</T> : null}

          <Button title={mode === 'sign-in' ? t('auth.signIn') : t('auth.createAccount')} onPress={submit} loading={busy} />
          <Button
            variant="link"
            title={mode === 'sign-in' ? t('auth.toSignUp') : t('auth.toSignIn')}
            onPress={() => {
              setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
              setError('');
            }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function friendly(message: string, t: ReturnType<typeof useT>) {
  if (/invalid login credentials/i.test(message)) return t('auth.errorBadCredentials');
  if (/already registered/i.test(message)) return t('auth.errorAlreadyRegistered');
  if (/email not confirmed/i.test(message)) return t('auth.errorNotConfirmed');
  if (/rate limit/i.test(message)) return t('auth.errorRateLimit');
  return message;
}
