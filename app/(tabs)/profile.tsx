import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Chip, T } from '@/components/ui';
import { LANGUAGES, useLanguage, useT, type Language } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { space, useTheme } from '@/theme';

// Each language is named in itself, so a reader who cannot read the current one can still find theirs.
const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', bg: 'Български' };

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

        <Card tone="mine">
          <T v="moment" style={{ fontSize: 26 }}>{t('profile.authorsWelcome')}</T>
          <T v="muted">{t('profile.authorsNote')}</T>
        </Card>

        <Button variant="secondary" title={t('common.signOut')} onPress={signOut} />
      </ScrollView>
    </SafeAreaView>
  );
}
