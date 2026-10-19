import { Pressable, Text, View } from 'react-native';

import { T } from '@/components/ui';
import { useLanguage, useT } from '@/i18n';
import { REACTIONS, type Comment, type Emoji } from '@/lib/discussions';
import { radius, space, useTheme } from '@/theme';

const MINUTE = 60_000;

/** A short relative time ("5m", "3h", "2d"), or the date once it is a week old. */
function useShortTime() {
  const t = useT();
  const { language } = useLanguage();
  return (iso: string) => {
    const age = Math.max(0, Date.now() - new Date(iso).getTime());
    if (age < MINUTE) return t('room.timeNow');
    if (age < 60 * MINUTE) return t('room.timeMinutes', { count: Math.floor(age / MINUTE) });
    if (age < 24 * 60 * MINUTE) return t('room.timeHours', { count: Math.floor(age / (60 * MINUTE)) });
    if (age < 7 * 24 * 60 * MINUTE) return t('room.timeDays', { count: Math.floor(age / (24 * 60 * MINUTE)) });
    return new Date(iso).toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-GB', { day: 'numeric', month: 'short' });
  };
}

function QuietAction({ label, onPress }: { label: string; onPress: () => void }) {
  const { fonts, c } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ minHeight: 44, justifyContent: 'center', paddingRight: space.m }}>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.muted }}>{label}</Text>
    </Pressable>
  );
}

export function CommentCard({
  comment,
  mine,
  onReply,
  onDelete,
  onReact,
}: {
  comment: Comment;
  mine: boolean;
  onReply?: () => void;
  onDelete: () => void;
  onReact: (emoji: Emoji, mine: boolean) => void;
}) {
  const { c, fonts } = useTheme();
  const t = useT();
  const shortTime = useShortTime();
  const deleted = comment.deleted_at !== null;

  return (
    <View style={{ gap: space.xs, padding: space.m, borderRadius: radius.m, backgroundColor: mine ? c.mine : c.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.s }}>
        <T v="label">{comment.author.username}</T>
        <T v="muted">{shortTime(comment.created_at)}</T>
      </View>
      {deleted ? (
        <T v="muted" style={{ fontStyle: 'italic' }}>
          {t('room.deleted')}
        </T>
      ) : (
        <>
          <T>{comment.body}</T>
          <View testID={`reactions-${comment.id}`} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
            {REACTIONS.map((emoji) => {
              const found = comment.reactions.find((r) => r.emoji === emoji);
              return (
                <Pressable
                  key={emoji}
                  accessibilityRole="button"
                  accessibilityLabel={t('room.react', { emoji, id: comment.id })}
                  accessibilityState={{ selected: !!found?.mine }}
                  onPress={() => onReact(emoji, !!found?.mine)}
                  style={{
                    minHeight: 44,
                    minWidth: 44,
                    paddingHorizontal: space.s,
                    borderRadius: radius.pill,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: found?.mine ? c.band : 'transparent',
                  }}
                >
                  <Text style={{ fontFamily: fonts.body, fontSize: found ? 14 : 16, color: c.inkSoft, opacity: found ? 1 : 0.55 }}>
                    {found ? `${emoji} ${found.count}` : emoji}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row' }}>
            {onReply ? <QuietAction label={t('room.reply')} onPress={onReply} /> : null}
            {mine ? <QuietAction label={t('room.delete')} onPress={onDelete} /> : null}
          </View>
        </>
      )}
    </View>
  );
}
