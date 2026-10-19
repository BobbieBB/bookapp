import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NotificationRow } from '@/components/NotificationRow';
import { Button, ErrorText, T } from '@/components/ui';
import { useT } from '@/i18n';
import { markReadUpTo, myNotifications } from '@/lib/notifications';
import { useLookup } from '@/lib/useLookup';
import { space, useTheme } from '@/theme';

export default function Notifications() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const { data, error } = useLookup('notifications', () => myNotifications());

  // Only what was shown is marked read (anything newer stays unread for next time).
  const newestShownAt = data?.[0]?.created_at;
  useEffect(() => {
    if (!newestShownAt) return;
    markReadUpTo(newestShownAt).catch(() => undefined); // best effort: the dots simply stay until the next visit
  }, [newestShownAt]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.ground }}>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.l }}>
        <View style={{ alignItems: 'flex-start' }}>
          <Button variant="link" title={t('notifications.back')} onPress={() => router.back()} />
        </View>
        <T v="h1">{t('notifications.title')}</T>
        {!data && error === undefined ? <ActivityIndicator color={c.primary} /> : null}
        <ErrorText>{error !== undefined ? t('notifications.error') : null}</ErrorText>
        {data?.length === 0 ? <T v="muted">{t('notifications.empty')}</T> : null}
        {data?.map((n) => <NotificationRow key={n.id} n={n} />)}
      </ScrollView>
    </SafeAreaView>
  );
}
