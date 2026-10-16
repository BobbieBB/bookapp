import { useState } from 'react';
import Feather from '@expo/vector-icons/Feather';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Chip, ErrorText, T } from '@/components/ui';
import { LANGUAGES, useLanguage, useT, type Language } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { addFavouriteFandom, myFandoms, removeFavouriteFandom, suggestedFandoms } from '@/lib/discover';
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
    const [mine, suggested] = await Promise.all([myFandoms(), suggestedFandoms()]);
    return { picked: mine.filter((f) => f.source === 'picked').map((f) => f.fandom), suggested };
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
            <Text style={{ fontSize: 14, fontFamily: fonts.bodyBold, color: c.ink }}>{fandom}</Text>
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
                <Text style={{ fontSize: 14, fontFamily: fonts.body, color: c.inkSoft }}>{fandom}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      <ErrorText>{failed || error !== undefined ? t('profile.fandomsError') : null}</ErrorText>
    </Card>
  );
}

export default function Profile() {
  const { c } = useTheme();
  const t = useT();
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
              <Chip key={code} label={LANGUAGE_NAMES[code]} active={code === language} onPress={() => setLanguage(code)} />
            ))}
          </View>
        </Card>

        <YourFandoms />

        <Card tone="mine">
          <T v="moment" style={{ fontSize: 26 }}>{t('profile.authorsWelcome')}</T>
          <T v="muted">{t('profile.authorsNote')}</T>
        </Card>

        <Button variant="secondary" title={t('common.signOut')} onPress={signOut} />
      </ScrollView>
    </SafeAreaView>
  );
}
