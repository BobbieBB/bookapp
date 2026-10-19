import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, Chip, ErrorText, Field, T } from '@/components/ui';
import { useLanguage, useT } from '@/i18n';
import { REACTIONS, type Comment, type Emoji } from '@/lib/discussions';
import type { ReportReason } from '@/lib/safety';
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

function QuietAction({ label, onPress, accessibilityLabel }: { label: string; onPress: () => void; accessibilityLabel?: string }) {
  const { fonts, c } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={{ minHeight: 44, justifyContent: 'center', paddingRight: space.m }}>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.muted }}>{label}</Text>
    </Pressable>
  );
}

const REASONS: readonly ReportReason[] = ['spam', 'harassment', 'spoiler', 'inappropriate', 'other'];

type Panel = 'report' | 'block' | null;

/** The inline report form and block confirmation of someone else's comment. */
function SafetyPanel({
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

export function CommentCard({
  comment,
  mine,
  onReply,
  onDelete,
  onReact,
  onReport,
  onBlock,
}: {
  comment: Comment;
  mine: boolean;
  onReply?: () => void;
  onDelete: () => void;
  onReact: (emoji: Emoji, mine: boolean) => void;
  /** Present on other people's comments: sends a report. */
  onReport?: (reason: ReportReason, details: string) => Promise<void>;
  /** Present on other people's comments, unless the author deleted their account: blocks the author. */
  onBlock?: () => Promise<void>;
}) {
  const { c, fonts } = useTheme();
  const t = useT();
  const shortTime = useShortTime();
  const deleted = comment.deleted_at !== null;
  const [panel, setPanel] = useState<Panel>(null);
  const [reported, setReported] = useState(false);
  // A deleted reader's comment (author null) can still be reported; there is nobody to block.
  const name = comment.author?.username ?? t('account.deletedReader');
  const canReport = !mine && !deleted && !!onReport;
  const canBlock = canReport && !!onBlock;

  return (
    <View testID={`comment-${comment.id}`} style={{ gap: space.xs, padding: space.m, borderRadius: radius.m, backgroundColor: mine ? c.mine : c.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.s }}>
        <T v="label">{name}</T>
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
            {canReport && !reported ? (
              <QuietAction label={t('safety.report')} accessibilityLabel={t('safety.reportLabel', { name })} onPress={() => setPanel('report')} />
            ) : null}
            {canBlock ? <QuietAction label={t('safety.block', { name })} onPress={() => setPanel('block')} /> : null}
          </View>
          {canReport && panel ? (
            <SafetyPanel
              key={panel}
              panel={panel}
              name={name}
              onClose={() => setPanel(null)}
              onReport={async (reason, details) => {
                await onReport(reason, details);
                setPanel(null);
                setReported(true);
              }}
              onBlock={onBlock}
            />
          ) : null}
          {reported ? (
            <Text accessibilityLiveRegion="polite" style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.success }}>
              {t('safety.reported')}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}
