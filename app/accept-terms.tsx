import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TermsConsent } from '@/components/TermsConsent';
import { Button, ErrorText, T } from '@/components/ui';
import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { TERMS_VERSION } from '@/lib/legal';
import { supabase } from '@/lib/supabase';
import { space, useTheme } from '@/theme';

/**
 * For readers whose accepted terms are older than TERMS_VERSION, or who joined before there were terms
 * (docs/DECISIONS.md, "Terms and age: ticked at sign-up"). The app opens once they accept; they can also
 * sign out or delete their account instead.
 */
export default function AcceptTerms() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const { session, refreshProfile, signOut } = useAuth();
  const [acceptsTerms, setAcceptsTerms] = useState(false);
  const [oldEnough, setOldEnough] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function accept() {
    setBusy(true);
    setFailed(false);
    // The server stamps the time; the root layout opens the app once the refreshed profile has this version.
    const { error } = await supabase
      .from('profiles')
      .update({ terms_version: TERMS_VERSION, age_confirmed: true })
      .eq('id', session!.user.id);
    if (error) {
      setFailed(true);
      setBusy(false);
      return;
    }
    await refreshProfile();
    setBusy(false);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.ground }}>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.l }}>
        <View style={{ gap: space.s }}>
          <T v="h1">{t('legal.gateTitle')}</T>
          <T>{t('legal.gateIntro')}</T>
        </View>
        <TermsConsent terms={acceptsTerms} age={oldEnough} onTerms={setAcceptsTerms} onAge={setOldEnough} disabled={busy} />
        <ErrorText>{failed ? t('legal.acceptFailed') : null}</ErrorText>
        <Button title={t('legal.accept')} onPress={() => void accept()} loading={busy} disabled={!acceptsTerms || !oldEnough} />
        <Button variant="link" title={t('common.signOut')} onPress={signOut} />
        <Button variant="link" title={t('account.deleteLink')} onPress={() => router.push('/delete-account')} />
      </ScrollView>
    </SafeAreaView>
  );
}
