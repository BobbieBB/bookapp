import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, Chip, ErrorText, Field, T } from '@/components/ui';
import { useT } from '@/i18n';
import type { ReportReason } from '@/lib/safety';
import { space, useTheme } from '@/theme';

/**
 * A quiet text action. A long label (a long username in "Block <name>", longer still in Bulgarian) shrinks
 * and ends in an ellipsis instead of running off the edge; the full text stays in the accessibility label.
 */
export function QuietAction({ label, onPress, accessibilityLabel }: { label: string; onPress: () => void; accessibilityLabel?: string }) {
  const { fonts, c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={{ minHeight: 44, justifyContent: 'center', paddingRight: space.m, flexShrink: 1, minWidth: 0 }}
    >
      <Text numberOfLines={1} ellipsizeMode="tail" style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.muted }}>
        {label}
      </Text>
    </Pressable>
  );
}

const REASONS: readonly ReportReason[] = ['spam', 'harassment', 'spoiler', 'inappropriate', 'other'];

/** The inline report form and block confirmation of someone else's comment. */
export function SafetyPanel({
  panel,
  name,
  onClose,
  onReport,
  onBlock,
}: {
  panel: 'report' | 'block';
  name: string;
  onClose: () => void;
  onReport: (reason: ReportReason, details: string) => Promise<void>;
  onBlock?: () => Promise<void>;
}) {
  const t = useT();
  const [reason, setReason] = useState<ReportReason>('other');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setFailed(false);
    try {
      await work();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View accessibilityViewIsModal={false} style={{ gap: space.s, paddingTop: space.s }}>
      {panel === 'report' ? (
        <>
          <T v="label">{t('safety.reportTitle')}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
            {REASONS.map((r) => (
              <Chip key={r} label={t(`safety.reason.${r}`)} active={reason === r} onPress={() => setReason(r)} />
            ))}
          </View>
          <Field label={t('safety.detailsLabel')} value={details} onChangeText={setDetails} multiline />
        </>
      ) : (
        <T>{t('safety.blockConfirm', { name })}</T>
      )}
      <ErrorText>{failed ? t('safety.error') : null}</ErrorText>
      <View style={{ flexDirection: 'row', gap: space.s, alignItems: 'center' }}>
        {panel === 'report' ? (
          <Button title={t('safety.sendReport')} loading={busy} onPress={() => void run(() => onReport(reason, details))} />
        ) : (
          <Button title={t('safety.blockButton')} loading={busy} onPress={() => onBlock && void run(onBlock)} />
        )}
        <Button variant="link" title={t('safety.cancel')} onPress={onClose} />
      </View>
    </View>
  );
}
