import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { WebLink } from '@/components/TermsConsent';
import { Button, Card, ErrorText, T } from '@/components/ui';
import { useLanguage, useT, type Language } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { TERMS_NOTICE_STORAGE_KEY, TERMS_URL, TERMS_VERSION, termsEffective, termsStatus } from '@/lib/legal';
import { space } from '@/theme';

/** A YYYY-MM-DD day in the reader's language: "1 December 2026", "1 декември 2026 г.". */
export function formatDay(day: string, language: Language) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Home's notice that the terms change on TERMS_EFFECTIVE, for readers on an older version before that day
 * (docs/DECISIONS.md, "Terms changes take effect on a date"). They can read the new terms, accept them
 * now on accept-terms (with the same ticks as the gate), or dismiss the notice, which this phone remembers for this version. From that day the root layout
 * sends them to accept-terms instead.
 */
export function TermsChangeNotice() {
  const t = useT();
  const { language } = useLanguage();
  const router = useRouter();
  const { profile } = useAuth();
  // null until the remembered answer has been read, so a dismissed notice never flashes by.
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [linkFailed, setLinkFailed] = useState(false);

  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(TERMS_NOTICE_STORAGE_KEY)
      .catch(() => null) // unreadable storage: show the notice
      .then((stored) => {
        if (live) setDismissed((now) => now ?? stored === TERMS_VERSION);
      });
    return () => {
      live = false;
    };
  }, []);

  if (dismissed !== false || termsStatus(profile?.terms_version) !== 'upcoming') return null;

  function dismiss() {
    setDismissed(true);
    AsyncStorage.setItem(TERMS_NOTICE_STORAGE_KEY, TERMS_VERSION).catch(() => {
      // Not saved: the notice shows again next time Home opens, which is harmless.
    });
  }

  return (
    <Card tone="band">
      <T v="h2">{t('legal.changeTitle', { date: formatDay(termsEffective(), language) })}</T>
      <T v="muted">{t('legal.changeBody')}</T>
      <WebLink title={t('legal.readNewTerms')} label={t('legal.readNewTerms')} url={TERMS_URL} onOpened={(ok) => setLinkFailed(!ok)} />
      <ErrorText>{linkFailed ? t('legal.linkFailed') : null}</ErrorText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.m }}>
        {/* The same ticks as the gate: accepting is never a single tap on a banner. */}
        <Button variant="secondary" title={t('legal.acceptNow')} onPress={() => router.push('/accept-terms')} />
        <Button variant="link" title={t('legal.dismiss')} onPress={dismiss} />
      </View>
    </Card>
  );
}
