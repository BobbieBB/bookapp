import { useEffect, useState } from 'react';
import Feather from '@expo/vector-icons/Feather';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Chip, ErrorText, T, Toggle } from '@/components/ui';
import { LANGUAGES, useLanguage, useT, type Language } from '@/i18n';
import { analyticsOptOut, setAnalyticsOptOut, track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { addFavouriteFandom, favouriteFandoms, removeFavouriteFandom, suggestedFandoms } from '@/lib/discover';
import { disablePush, enablePush, pushIsOn, type PushStatus } from '@/lib/pushDevice';
import { useLookup } from '@/lib/useLookup';
import { radius, space, useTheme } from '@/theme';

// Each language is named in itself, so a reader who cannot read the current one can still find theirs.
const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', bg: 'Български' };

function YourFandoms() {
  const { c, fonts } = useTheme();
  const t = useT();
  const [version, setVersion] = useState(0);
  const [failed, setFailed] = useState(false);
  const { data, error, previous } = useLookup(`fandoms-${version}`, async () => {
    const [picked, suggested] = await Promise.all([favouriteFandoms(), suggestedFandoms()]);
    return { picked, suggested };
  });
  const shown = data ?? previous;

  // Changes appear only once the save succeeded and the lists were reloaded.
  async function change(save: () => Promise<void>) {
    setFailed(false);
    try {
      await save();
      setVersion((v) => v + 1);
    } catch {
      setFailed(true);
    }
  }

  if (!shown) {
    return error === undefined ? null : (
      <Card>
        <T v="h2">{t('profile.fandoms')}</T>
        <ErrorText>{t('profile.fandomsError')}</ErrorText>
      </Card>
    );
  }

  return (
    <Card>
      <T v="h2">{t('profile.fandoms')}</T>
      <T v="muted">{t('profile.fandomsHint')}</T>
      {shown.picked.length === 0 && <T v="muted">{t('profile.fandomsEmpty')}</T>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
        {shown.picked.map((fandom) => (
          <View
            key={fandom}
            style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, borderRadius: radius.pill, backgroundColor: c.mine, paddingLeft: 14 }}
          >
            <Text style={{ fontSize: 15, fontFamily: fonts.bodyBold, color: c.ink }}>{fandom}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('profile.removeFandom', { fandom })}
              onPress={() => change(() => removeFavouriteFandom(fandom))}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <Feather name="x" size={16} color={c.ink} />
            </Pressable>
          </View>
        ))}
      </View>
      {shown.suggested.length > 0 && (
        <>
          <T v="overline">{t('profile.fandomsSuggested')}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
            {shown.suggested.map((fandom) => (
              <Pressable
                key={fandom}
                accessibilityRole="button"
                accessibilityLabel={t('profile.addFandom', { fandom })}
                onPress={() => change(() => addFavouriteFandom(fandom))}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.xs,
                  minHeight: 44,
                  paddingHorizontal: 14,
                  borderRadius: radius.pill,
                  borderWidth: 1.5,
                  borderStyle: 'dashed',
                  borderColor: c.muted,
                }}
              >
                <Feather name="plus" size={14} color={c.inkSoft} />
                <Text style={{ fontSize: 15, fontFamily: fonts.body, color: c.inkSoft }}>{fandom}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      <ErrorText>{failed || error !== undefined ? t('profile.fandomsError') : null}</ErrorText>
    </Card>
  );
}

const PUSH_NOTE = {
  denied: 'profile.pushDenied',
  unsupported: 'profile.pushUnsupported',
  'not-configured': 'profile.pushNotConfigured',
} as const;

function PhoneNotifications() {
  const t = useT();
  const { language } = useLanguage();
  const [on, setOn] = useState(false);
  const [note, setNote] = useState<Exclude<PushStatus, 'enabled'> | 'failed' | null>(null);

  useEffect(() => {
    let live = true;
    pushIsOn()
      .then((isOn) => live && setOn(isOn))
      .catch(() => {
        // Unreadable storage: the switch starts off.
      });
    return () => {
      live = false;
    };
  }, []);

  async function change(next: boolean) {
    setNote(null);
    try {
      if (next) {
        const status = await enablePush(language);
        setOn(status === 'enabled');
        setNote(status === 'enabled' ? null : status);
      } else {
        await disablePush();
        setOn(false);
      }
    } catch {
      setNote('failed');
    }
  }

  return (
    <Card>
      <Toggle label={t('profile.push')} value={on} onChange={change} />
      <T v="muted">{t('profile.pushHint')}</T>
      <ErrorText>{note === null ? null : t(note === 'failed' ? 'profile.pushError' : PUSH_NOTE[note])}</ErrorText>
    </Card>
  );
}

// "Help us improve the app": on by default; off means track() records nothing (docs/DECISIONS.md).
function HelpUsImprove() {
  const t = useT();
  const [version, setVersion] = useState(0);
  const [failed, setFailed] = useState(false);
  const { data, error, previous } = useLookup(`analytics-opt-out-${version}`, analyticsOptOut);
  const optedOut = data ?? previous ?? false;

  async function change(on: boolean) {
    setFailed(false);
    try {
      await setAnalyticsOptOut(!on);
      setVersion((v) => v + 1);
    } catch {
      setFailed(true);
    }
  }

  return (
    <Card>
      <Toggle label={t('profile.analytics')} value={!optedOut} onChange={change} />
      <T v="muted">{t('profile.analyticsHint')}</T>
      <ErrorText>{failed || error !== undefined ? t('profile.analyticsError') : null}</ErrorText>
    </Card>
  );
}

export default function Profile() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const { language, setLanguage } = useLanguage();
  const { profile, session, signOut } = useAuth();
  const reads = profile?.reads_books
    ? profile.reads_fanfic
      ? t('profile.readsBoth')
      : t('profile.readsBooks')
    : profile?.reads_fanfic
      ? t('profile.readsFanfiction')
      : null;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.ground }}>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.l }}>
        <View style={{ gap: space.xs }}>
          <T v="h1">{profile?.username}</T>
          <T v="muted">{session?.user.email}</T>
          {reads && <T>{reads}</T>}
        </View>

        <Card>
          <T v="h2">{t('profile.language')}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
            {LANGUAGES.map((code) => (
              <Chip key={code} label={LANGUAGE_NAMES[code]} active={code === language} onPress={() => {
                setLanguage(code);
                if (code !== language) void track('language_changed', { language: code });
              }} />
            ))}
          </View>
        </Card>

        <YourFandoms />

        <PhoneNotifications />

        <HelpUsImprove />

        <Card tone="mine">
          <T v="moment" style={{ fontSize: 26 }}>{t('profile.authorsWelcome')}</T>
          <T v="muted">{t('profile.authorsNote')}</T>
          <View style={{ alignItems: 'flex-start' }}>
            <Button variant="link" title={t('safety.readMore')} onPress={() => router.push('/authors')} />
          </View>
        </Card>

        <Card>
          <Button variant="link" title={t('safety.feedbackTitle')} onPress={() => router.push('/feedback')} />
          <Button variant="link" title={t('safety.blockedTitle')} onPress={() => router.push('/blocked')} />
        </Card>

        <Button variant="secondary" title={t('common.signOut')} onPress={signOut} />
      </ScrollView>
    </SafeAreaView>
  );
}
