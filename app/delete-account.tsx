import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, ErrorText, T } from '@/components/ui';
import { useT } from '@/i18n';
import { deleteMyAccount } from '@/lib/account';
import { space, useTheme } from '@/theme';

/** One option of a required choice: a radio button with its one-line explanation under the label. */
function Choice({ label, hint, checked, onPress, disabled }: { label: string; hint: string; checked: boolean; onPress: () => void; disabled: boolean }) {
  const { c, fonts } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ checked, disabled }}
      onPress={onPress}
      disabled={disabled}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.m, minHeight: 44, paddingVertical: space.xs }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          marginTop: 1,
          borderRadius: 12,
          borderWidth: 2,
          // muted, not hairline: an empty circle needs 3:1 contrast against the card in light and dark.
          borderColor: checked ? c.primary : c.muted,
          backgroundColor: c.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c.primary }} /> : null}
      </View>
      {/* The text wraps (Bulgarian labels are long); the circle keeps its size. */}
      <View style={{ flex: 1, gap: space.xs }}>
        <Text style={{ fontSize: 16, fontFamily: fonts.bodyBold, color: c.ink }}>{label}</Text>
        <Text style={{ fontSize: 14, fontFamily: fonts.body, color: c.muted }}>{hint}</Text>
      </View>
    </Pressable>
  );
}

/**
 * Profile > Delete my account. Says what goes and what stays, makes the reader choose what happens to
 * their comments (nothing is chosen for them), then asks once more.
 */
export default function DeleteAccount() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  // null until the reader chooses: deleting needs an explicit choice (GDPR art. 17, the content licence).
  const [erase, setErase] = useState<boolean | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState(false);

  const remove = async () => {
    // Delete is disabled until the reader chooses, so this only narrows the type.
    if (erase === null) return;
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
          <T>{t('account.stays')}</T>
          <View accessibilityRole="radiogroup" accessibilityLabel={t('account.stays')} style={{ gap: space.m }}>
            <Choice
              label={t('account.keepComments')}
              hint={t('account.keepCommentsHint')}
              checked={erase === false}
              onPress={() => setErase(false)}
              // Locked under the confirmation, so the choice can't change after "Delete my account".
              disabled={deleting || confirming}
            />
            <Choice
              label={t('account.eraseComments')}
              hint={t('account.eraseCommentsHint')}
              checked={erase === true}
              onPress={() => setErase(true)}
              // Locked under the confirmation, so the choice can't change after "Delete my account".
              disabled={deleting || confirming}
            />
          </View>
        </Card>
        <ErrorText>{failed ? t('account.failed') : null}</ErrorText>
        {confirming ? (
          <Card tone="band">
            <T v="label">{t('account.confirm')}</T>
            <Button title={t('account.confirmDelete')} onPress={() => void remove()} loading={deleting} />
            <Button variant="link" title={t('account.keep')} onPress={() => setConfirming(false)} disabled={deleting} />
          </Card>
        ) : (
          <Button variant="secondary" title={t('account.delete')} onPress={() => setConfirming(true)} disabled={erase === null} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
