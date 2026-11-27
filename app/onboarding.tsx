import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Checkbox, TermsConsent } from '@/components/TermsConsent';
import { Button, Card, ErrorText, Field, T, Toggle } from '@/components/ui';
import { useT } from '@/i18n';
import { setAnalyticsConsent, track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { TERMS_VERSION } from '@/lib/legal';
import { NAME_RULE, nameProblem } from '@/lib/names';
import { supabase } from '@/lib/supabase';
import { space, useTheme } from '@/theme';
import { useKeyboardSpace } from '@/lib/keyboard';

export default function Onboarding() {
  const { c } = useTheme();
  const t = useT();
  const { session, refreshProfile, signOut } = useAuth();
  const [username, setUsername] = useState('');
  const [leftName, setLeftName] = useState(false);
  const [tried, setTried] = useState(false);
  const [readsBooks, setReadsBooks] = useState(true);
  const [readsFanfic, setReadsFanfic] = useState(true);
  const [acceptsTerms, setAcceptsTerms] = useState(false);
  const [oldEnough, setOldEnough] = useState(false);
  // Analytics are opt-in (docs/DECISIONS.md, "Analytics: opt-in"): unticked, and not needed to start.
  const [helpsImprove, setHelpsImprove] = useState(false);
  const ticked = acceptsTerms && oldEnough;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setError('');
    const handle = username.trim();
    if (!NAME_RULE.test(handle)) {
      // The field shows why; no second copy of the message by the button.
      setTried(true);
      return;
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
      // The server stamps the time; it refuses a version without the age tick.
      terms_version: TERMS_VERSION,
      age_confirmed: true,
    });
    setBusy(false);
    if (error) {
      if (error.code === '23505' && /profiles_pkey/.test(error.message)) {
        // The profile already exists (e.g. created on another device): just load it.
        await refreshProfile();
        return;
      }
      // Never the raw message: LV001 is the server refusing the terms without the age tick.
      setError(
        error.code === '23505' ? t('auth.errorNameTaken') : error.code === 'LV001' ? t('legal.tickBoth') : t('auth.saveFailed'),
      );
      return;
    }
    // Consent needs the account, and the first events need consent: profile, then consent, then the events.
    // A failed consent save doesn't hold the reader up; they can switch it on in Profile.
    const source = readsBooks && readsFanfic ? 'both' : readsBooks ? 'books' : 'fanfic';
    void (async () => {
      if (helpsImprove) await setAnalyticsConsent(true).catch(() => undefined);
      await track('sign_up');
      await track('onboarding_done', { source });
    })();
    await refreshProfile();
  }

  const kb = useKeyboardSpace();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.ground }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={kb.ref} onScroll={kb.onScroll} scrollEventThrottle={16} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.xl, paddingBottom: space.xl + kb.bottom, gap: space.l }}>
          <View style={{ gap: space.s }}>
            <T v="h1">{t('auth.onboardTitle')}</T>
            <T>{t('auth.onboardIntro')}</T>
          </View>

          <View style={{ gap: space.xs }}>
            <Field
              label={t('common.name')}
              value={username}
              onChangeText={setUsername}
              onBlur={() => setLeftName(true)}
              error={nameProblem(username, { left: leftName, tried }) ? t('auth.errorBadName') : undefined}
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

          <TermsConsent terms={acceptsTerms} age={oldEnough} onTerms={setAcceptsTerms} onAge={setOldEnough} disabled={busy} />
          <Checkbox label={t('legal.analyticsConsent')} checked={helpsImprove} onChange={setHelpsImprove} disabled={busy} />

          <ErrorText>{error}</ErrorText>
          {ticked ? null : <T v="muted">{t('legal.tickBoth')}</T>}
          <Button
            title={t('auth.startReading')}
            onPress={save}
            loading={busy}
            disabled={!ticked}
            accessibilityHint={ticked ? undefined : t('legal.tickBoth')}
          />
          <Button variant="link" title={t('common.signOut')} onPress={signOut} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
