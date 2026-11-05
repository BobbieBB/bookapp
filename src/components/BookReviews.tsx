import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { QuietAction, SafetyPanel } from '@/components/SafetyPanel';
import { Card, ErrorText, T } from '@/components/ui';
import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { reportReview } from '@/lib/safety';
import { bookStats, loadReviews, type Review } from '@/lib/reviews';
import { useLookup } from '@/lib/useLookup';
import { space, useTheme } from '@/theme';

/** A book's average rating and its reviews. Spoiler reviews stay hidden until the reader taps them. */
export function BookReviews({ storyId, version }: { storyId: string; version: number }) {
  const { c } = useTheme();
  const t = useT();
  const stats = useLookup(`${storyId}:${version}`, () => bookStats(storyId));
  const reviews = useLookup(`${storyId}:${version}`, () => loadReviews(storyId));
  const shownStats = stats.data !== undefined ? stats.data : stats.previous;
  const shownReviews = reviews.data ?? reviews.previous;
  const userId = useAuth().session?.user.id;

  return (
    <View style={{ gap: space.s }}>
      {shownStats && shownStats.count > 0 ? (
        <T v="label">{t('finishing.ratings', { average: shownStats.average.toFixed(1), count: shownStats.count })}</T>
      ) : null}
      <T v="overline">{t('finishing.reviews')}</T>
      {stats.error || reviews.error ? <ErrorText>{t('finishing.reviewsFailed')}</ErrorText> : null}
      {shownReviews ? (
        shownReviews.map((r) => <ReviewCard key={r.id} review={r} mine={r.author?.id === userId} />)
      ) : reviews.error ? null : (
        <ActivityIndicator color={c.signal} />
      )}
    </View>
  );
}

function ReviewCard({ review, mine }: { review: Review; mine: boolean }) {
  const { c, fonts } = useTheme();
  const t = useT();
  const [revealed, setRevealed] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const hidden = review.contains_spoilers && !revealed;
  const name = review.author?.username ?? t('account.deletedReader');
  return (
    <Card>
      <T v="label">{review.author?.username ?? t('account.deletedReader')}</T>
      {hidden ? (
        <Pressable accessibilityRole="button" onPress={() => setRevealed(true)} style={{ minHeight: 44, justifyContent: 'center' }}>
          <T v="muted">{t('finishing.spoilerHidden')}</T>
        </Pressable>
      ) : (
        <T v="body">{review.body}</T>
      )}
      {!mine && !reported && !reporting ? (
        <View style={{ flexDirection: 'row' }}>
          <QuietAction label={t('safety.report')} accessibilityLabel={t('safety.reportReviewLabel', { name })} onPress={() => setReporting(true)} />
        </View>
      ) : null}
      {reporting ? (
        <SafetyPanel
          panel="report"
          name={name}
          onClose={() => setReporting(false)}
          onReport={async (reason, details) => {
            await reportReview(review.id, reason, details);
            setReporting(false);
            setReported(true);
          }}
        />
      ) : null}
      {reported ? (
        <Text accessibilityLiveRegion="polite" style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.success }}>
          {t('safety.reported')}
        </Text>
      ) : null}
    </Card>
  );
}
