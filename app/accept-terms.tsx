import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatDay } from '@/components/TermsChangeNotice';
import { TermsConsent } from '@/components/TermsConsent';
import { Button, ErrorText, T } from '@/components/ui';
import { useLanguage, useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { TERMS_VERSION, termsEffective, termsStatus } from '@/lib/legal';
import { supabase } from '@/lib/supabase';
import { space, useTheme } from '@/theme';

/**
 * For readers whose accepted terms are older than TERMS_VERSION, or who joined before there were terms
 * (docs/DECISIONS.md, "Terms and age: ticked at sign-up"). The app opens once they accept; they can also
 * sign out or delete their account instead. Before a change takes effect, readers who tap "Accept now" on
 * Home's notice come here too, so accepting early is the same explicit act; "Not now" takes them back.
 */
export default function AcceptTerms() {
  const { c } = useTheme();
  const t = useT();
  const { language } = useLanguage();
  const router = useRouter();
  const { session, profile, refreshProfile, signOut } = useAuth();
  // Pinned on open: accepting turns the status to 'current' before the root layout closes this screen.
  const [early] = useState(() => termsStatus(profile?.terms_version) === 'upcoming');
  const [acceptsTerms, setAcceptsTerms] = useState(false);
  const [oldEnough, setOldEnough] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const ticked = acceptsTerms && oldEnough;

  async function accept() {
    setBusy(true);
    setFailed(false);
    // The server stamps the time; the root layout opens the app once the refreshed profile has this version.
    // No row back means nothing was saved (e.g. the profile was deleted on another device).
    const { data, error } = await supabase
      .from('profiles')
      .update({ terms_version: TERMS_VERSION, age_confirmed: true })
      .eq('id', session!.user.id)
      .select('terms_version');
    const saved = !error && data.length === 1 && (await refreshProfile());
    setFailed(!saved);
    setBusy(false);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.ground }}>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.l }}>
        <View style={{ gap: space.s }}>
          <T v="h1">{early ? t('legal.earlyTitle') : t('legal.gateTitle')}</T>
          <T>{early ? t('legal.earlyIntro', { date: formatDay(termsEffective(), language) }) : t('legal.gateIntro')}</T>
        </View>
        <TermsConsent terms={acceptsTerms} age={oldEnough} onTerms={setAcceptsTerms} onAge={setOldEnough} disabled={busy} />
        <ErrorText>{failed ? t('legal.acceptFailed') : null}</ErrorText>
        {ticked ? null : <T v="muted">{t('legal.tickBoth')}</T>}
        <Button
          title={t('legal.accept')}
          onPress={() => void accept()}
          loading={busy}
          disabled={!ticked}
          accessibilityHint={ticked ? undefined : t('legal.tickBoth')}
        />
        {early ? (
          <Button variant="link" title={t('legal.notNow')} onPress={() => router.back()} disabled={busy} />
        ) : (
          <>
            <Button variant="link" title={t('common.signOut')} onPress={signOut} />
            <Button variant="link" title={t('account.deleteLink')} onPress={() => router.push('/delete-account')} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
