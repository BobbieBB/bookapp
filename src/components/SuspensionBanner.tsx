import { View } from 'react-native';

import { T } from '@/components/ui';
import { useT } from '@/i18n';
import type { Suspension } from '@/lib/suspension';
import { radius, space, useTheme } from '@/theme';

/**
 * Home's banner while the signed-in reader is suspended (docs/DECISIONS.md, "Suspending a reader"):
 * the latest reason, what still works, and where to contest it. Nothing when they are not suspended.
 */
export function SuspensionBanner({ suspension }: { suspension: Suspension | undefined }) {
  const t = useT();
  const { c } = useTheme();
  if (!suspension?.suspended) return null;
  return (
    <View
      testID="suspension-banner"
      accessibilityRole="alert"
      style={{ gap: space.s, padding: space.l, borderRadius: radius.s, borderWidth: 1.5, borderColor: c.danger, backgroundColor: c.surface }}
    >
      <T v="h2">{t('notifications.account_suspended')}</T>
      {suspension.reason ? <T v="body">{t('notifications.reason', { reason: suspension.reason })}</T> : null}
      <T v="muted">{t('notifications.suspendedBody')}</T>
    </View>
  );
}
