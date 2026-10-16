import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, ErrorText, T } from '@/components/ui';
import { useT } from '@/i18n';
import { blockedReaders, unblock } from '@/lib/safety';
import { useLookup } from '@/lib/useLookup';
import { space, useTheme } from '@/theme';

export default function Blocked() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const [version, setVersion] = useState(0);
  const [failed, setFailed] = useState(false);
  const { data, error, previous } = useLookup(`blocked-${version}`, blockedReaders);
  const readers = data ?? previous;

  const undo = async (id: string) => {
    setFailed(false);
    try {
      await unblock(id);
      setVersion((v) => v + 1);
    } catch {
      setFailed(true);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.ground }}>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.l }}>
        <View style={{ alignItems: 'flex-start' }}>
          <Button variant="link" title={t('safety.back')} onPress={() => router.back()} />
        </View>
        <T v="h1">{t('safety.blockedTitle')}</T>
        {!readers && error === undefined ? <ActivityIndicator color={c.primary} /> : null}
        <ErrorText>{failed || error !== undefined ? t('safety.error') : null}</ErrorText>
        {readers && readers.length === 0 ? <T v="muted">{t('safety.blockedEmpty')}</T> : null}
        {readers?.map((reader) => (
          <Card key={reader.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s }}>
              <T v="label">{reader.username}</T>
              <Button
                variant="secondary"
                title={t('safety.unblock')}
                accessibilityLabel={t('safety.unblockName', { name: reader.username })}
                onPress={() => void undo(reader.id)}
              />
            </View>
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
