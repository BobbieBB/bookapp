import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ErrorText, Field, T } from '@/components/ui';
import { APP_NAME } from '@/lib/config';
import { supabase } from '@/lib/supabase';
import { space, useTheme } from '@/theme';

export default function SignIn() {
  const { c } = useTheme();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit() {
    setError('');
    setNotice('');
    if (!email.includes('@')) return setError('Please enter your email address.');
    if (password.length < 8) return setError('Your password needs at least 8 characters.');

    setBusy(true);
    if (mode === 'sign-in') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setError(friendly(error.message));
    } else {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
      if (error) setError(friendly(error.message));
      else if (!data.session) {
        // Email confirmation is switched on in Supabase: the user must click the link first.
        setNotice('Almost there! Check your inbox and confirm your email, then sign in here.');
        setMode('sign-in');
      }
    }
    setBusy(false);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.band }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.l, flexGrow: 1, justifyContent: 'center' }}>
          <View style={{ gap: space.s, marginBottom: space.m }}>
            <T v="overline">{APP_NAME.toUpperCase()}</T>
            <T v="h1">{mode === 'sign-in' ? 'Welcome back' : 'Join the readers'}</T>
            <T>
              Talk about books and fanfiction chapter by chapter, with people who are exactly where you are. No
              spoilers, ever.
            </T>
          </View>

          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            placeholder="At least 8 characters"
          />

          <ErrorText>{error}</ErrorText>
          {notice ? <T style={{ color: c.success }}>{notice}</T> : null}

          <Button title={mode === 'sign-in' ? 'Sign in' : 'Create account'} onPress={submit} loading={busy} />
          <Button
            variant="link"
            title={mode === 'sign-in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
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

function friendly(message: string) {
  if (/invalid login credentials/i.test(message)) return 'That email and password don’t match.';
  if (/already registered/i.test(message)) return 'This email already has an account. Try signing in.';
  if (/email not confirmed/i.test(message)) return 'Please confirm your email first. Check your inbox.';
  if (/rate limit/i.test(message)) return 'Too many attempts. Please wait a minute and try again.';
  return message;
}
