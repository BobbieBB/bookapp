import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { T } from '@/components/ui';
import { useLanguage, useT } from '@/i18n';
import { roomPath, type Notification } from '@/lib/notifications';
import { relativeTime } from '@/lib/relativeTime';
import { radius, space, useTheme } from '@/theme';

/** One reply / mention / reaction: who, where, when. Never the comment text. */
export function NotificationRow({ n }: { n: Notification }) {
  const t = useT();
  const { language } = useLanguage();
  const { c, card } = useTheme();
  // No actor once they deleted their account.
  const name = n.actor_username ?? t('account.deletedReader');
  const what = t(`notifications.${n.type}`, { name });
  const room = n.room_kind === 'epilogue' ? t('room.epilogue') : t('room.chapter', { n: n.section_number ?? 0 });
  const unread = n.read_at === null;

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={unread ? `${what}. ${t('notifications.unread')}` : what}
      onPress={() => router.push(roomPath(n) as never)}
      style={[card, { flexDirection: 'row', alignItems: 'center', gap: space.m, padding: space.m }]}
    >
      <View style={{ flex: 1, gap: space.xs }}>
        <T v="label">{what}</T>
        <T v="muted" numberOfLines={1}>
          {t('notifications.where', { story: n.story_title, room })}
        </T>
        <T v="muted">{relativeTime(n.created_at, language)}</T>
      </View>
      {unread ? <View accessibilityElementsHidden style={{ width: 10, height: 10, borderRadius: radius.pill, backgroundColor: c.primary }} /> : null}
    </Pressable>
  );
}
