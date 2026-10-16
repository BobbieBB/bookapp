import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, ErrorText, Field, T, Toggle } from '@/components/ui';
import { useT } from '@/i18n';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { space, useTheme } from '@/theme';

export default function Onboarding() {
  const { c } = useTheme();
  const t = useT();
  const { session, refreshProfile, signOut } = useAuth();
  const [username, setUsername] = useState('');
  const [readsBooks, setReadsBooks] = useState(true);
  const [readsFanfic, setReadsFanfic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setError('');
    const handle = username.trim();
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(handle)) {
      return setError(t('auth.errorBadName'));
    }
    if (!readsBooks && !readsFanfic) return setError(t('auth.errorPickOne'));

    setBusy(true);
    const { error } = await supabase.from('profiles').insert({
      id: session!.user.id,
      username: handle,
      // One name per reader (decided 13 Oct 2026). display_name stays in the
      // database, unused, in case we ever allow names with spaces.
      display_name: null,
      reads_books: readsBooks,
      reads_fanfic: readsFanfic,
    });
    setBusy(false);
    if (error) {
      if (error.code === '23505' && /profiles_pkey/.test(error.message)) {
        // The profile already exists (e.g. created on another device): just load it.
        await refreshProfile();
        return;
      }
      setError(error.code === '23505' ? t('auth.errorNameTaken') : error.message);
      return;
    }
    void track('onboarding_done', { source: readsBooks && readsFanfic ? 'both' : readsBooks ? 'books' : 'fanfic' });
    await refreshProfile();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.ground }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.l }}>
          <View style={{ gap: space.s }}>
            <T v="h1">{t('auth.onboardTitle')}</T>
            <T>{t('auth.onboardIntro')}</T>
          </View>

          <View style={{ gap: space.xs }}>
            <Field
              label={t('common.name')}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={t('auth.namePlaceholder')}
            />
            <T v="muted">{t('auth.nameHint')}</T>
          </View>

          <Card>
            <T v="h2">{t('auth.whatDoYouRead')}</T>
            <Toggle label={t('auth.books')} value={readsBooks} onChange={setReadsBooks} />
            <Toggle label={t('auth.fanfiction')} value={readsFanfic} onChange={setReadsFanfic} />
            <T v="muted">{t('auth.sectionsHint')}</T>
          </Card>

          {readsFanfic && (
            <Card tone="mine">
              <T v="moment" style={{ fontSize: 24 }}>{t('auth.giftQuote')}</T>
              <T v="muted">{t('auth.etiquette')}</T>
            </Card>
          )}

          <ErrorText>{error}</ErrorText>
          <Button title={t('auth.startReading')} onPress={save} loading={busy} />
          <Button variant="link" title={t('common.signOut')} onPress={signOut} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
