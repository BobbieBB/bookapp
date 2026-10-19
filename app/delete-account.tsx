import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, ErrorText, T, Toggle } from '@/components/ui';
import { useT } from '@/i18n';
import { deleteMyAccount } from '@/lib/account';
import { space, useTheme } from '@/theme';

/** Profile > Delete my account. Says what goes and what stays, then asks once more. */
export default function DeleteAccount() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const [erase, setErase] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState(false);

  const remove = async () => {
    setDeleting(true);
    setFailed(false);
    try {
      // Signs out when done; the root layout then shows the sign-in screen.
      await deleteMyAccount({ eraseComments: erase });
    } catch {
      setFailed(true);
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.ground }}>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.l }}>
        <View style={{ alignItems: 'flex-start' }}>
          <Button variant="link" title={t('safety.back')} onPress={() => router.back()} />
        </View>
        <T v="h1">{t('account.title')}</T>
        <T>{t('account.intro')}</T>
        <Card>
          <T v="h2">{t('account.goesHeading')}</T>
          <T>{t('account.goes')}</T>
        </Card>
        <Card>
          <T v="h2">{t('account.staysHeading')}</T>
          <T>{erase ? t('account.staysErased') : t('account.stays')}</T>
          <Toggle label={t('account.erase')} value={erase} onChange={setErase} disabled={deleting} />
        </Card>
        <ErrorText>{failed ? t('account.failed') : null}</ErrorText>
        {confirming ? (
          <Card tone="band">
            <T v="label">{t('account.confirm')}</T>
            <Button title={t('account.confirmDelete')} onPress={() => void remove()} loading={deleting} />
            <Button variant="link" title={t('account.keep')} onPress={() => setConfirming(false)} disabled={deleting} />
          </Card>
        ) : (
          <Button variant="secondary" title={t('account.delete')} onPress={() => setConfirming(true)} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
