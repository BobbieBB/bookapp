import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { T } from '@/components/ui';
import { useLanguage, useT } from '@/i18n';
import { isModerationNotice, roomPath, type Notification } from '@/lib/notifications';
import { relativeTime } from '@/lib/relativeTime';
import { radius, space, useTheme } from '@/theme';

/** One reply / mention / reaction: who, where, when. Never the comment text. */
export function NotificationRow({ n }: { n: Notification }) {
  return isModerationNotice(n) ? <ModerationNotice n={n} /> : <SocialNotification n={n} />;
}

function SocialNotification({ n }: { n: Notification }) {
  const t = useT();
  const { language } = useLanguage();
  const { c, card } = useTheme();
  // No actor once they deleted their account.
  const name = n.actor_username ?? t('account.deletedReader');
  const what = t(`notifications.${n.type as 'reply' | 'mention' | 'reaction'}`, { name });
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
          {t('notifications.where', { story: n.story_title ?? '', room })}
        </T>
        <T v="muted">{relativeTime(n.created_at, language)}</T>
      </View>
      {unread ? <View accessibilityElementsHidden style={{ width: 10, height: 10, borderRadius: radius.pill, backgroundColor: c.signal }} /> : null}
    </Pressable>
  );
}

/**
 * A moderation decision (EU DSA arts. 16(5) and 17): your comment or review was hidden and why, or
 * what was decided on your report. Never names the other reader; leads nowhere (the content is gone).
 */
function ModerationNotice({ n }: { n: Notification }) {
  const t = useT();
  const { language } = useLanguage();
  const { c, card } = useTheme();
  const story = n.story_title ?? '';
  let what: string;
  if (n.type === 'content_hidden') {
    const reason = t(`notifications.hiddenReason.${n.reason ?? 'other'}`);
    what = t(n.content_kind === 'review' ? 'notifications.reviewHidden' : 'notifications.commentHidden', { story, reason });
  } else {
    const item = t(`notifications.reported.${n.content_kind ?? 'reader'}`);
    const decision = t(n.outcome === 'actioned' ? 'notifications.decisionHidden' : 'notifications.decisionKept');
    what = n.story_title
      ? t('notifications.reportResolved', { item, story, decision })
      : t('notifications.reportResolvedNoStory', { item, decision });
  }
  const room = n.room_kind === 'epilogue' ? t('room.epilogue') : n.room_kind ? t('room.chapter', { n: n.section_number ?? 0 }) : null;
  const unread = n.read_at === null;

  return (
    <View
      accessible
      accessibilityLabel={unread ? `${what}. ${t('notifications.unread')}` : what}
      style={[card, { flexDirection: 'row', alignItems: 'center', gap: space.m, padding: space.m }]}
    >
      <View style={{ flex: 1, gap: space.xs }}>
        <T v="label">{what}</T>
        {room ? <T v="muted">{room}</T> : null}
        <T v="muted">{relativeTime(n.created_at, language)}</T>
      </View>
      {unread ? <View accessibilityElementsHidden style={{ width: 10, height: 10, borderRadius: radius.pill, backgroundColor: c.signal }} /> : null}
    </View>
  );
}
