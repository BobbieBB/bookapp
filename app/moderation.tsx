import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ModerationQueue } from '@/components/ModerationQueue';
import { Button, ErrorText, T } from '@/components/ui';
import { useT } from '@/i18n';
import { fetchQueue } from '@/lib/moderation';
import { useLookup } from '@/lib/useLookup';
import { space, useTheme } from '@/theme';

// Profile > Moderation: the open reports and requests, newest first (docs/DECISIONS.md, "Moderation
// in v1"). Only admins get the link; the database refuses everyone else, and this screen says so.

// Postgres' "permission denied" (42501): moderation_queue refuses readers who are not admins.
const code = (error: unknown) => (error as { code?: string } | null)?.code;
const refused = (error: unknown) => code(error) === '42501';

export default function Moderation() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const [version, setVersion] = useState(0);
  const { data, error, previous } = useLookup(`moderation-queue-${version}`, fetchQueue);
  // After an action the list reloads; the old one stays on screen meanwhile instead of a spinner.
  const items = data ?? previous;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.ground }}>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.l }}>
        <View style={{ alignItems: 'flex-start' }}>
          <Button variant="link" title={t('moderation.back')} onPress={() => router.back()} />
        </View>
        <T v="h1">{t('moderation.title')}</T>
        {error !== undefined ? (
          <ErrorText>{refused(error) ? t('moderation.refused') : t('moderation.error')}</ErrorText>
        ) : !items ? (
          <ActivityIndicator color={c.primary} accessibilityLabel={t('moderation.loading')} />
        ) : (
          <ModerationQueue items={items} onResolved={() => setVersion((v) => v + 1)} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
