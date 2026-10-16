import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Card, ErrorText, T } from '@/components/ui';
import { useT } from '@/i18n';
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

  return (
    <View style={{ gap: space.s }}>
      {shownStats && shownStats.count > 0 ? (
        <T v="label">{t('finishing.ratings', { average: shownStats.average.toFixed(1), count: shownStats.count })}</T>
      ) : null}
      <T v="overline">{t('finishing.reviews')}</T>
      {stats.error || reviews.error ? <ErrorText>{t('finishing.reviewsFailed')}</ErrorText> : null}
      {shownReviews ? (
        shownReviews.map((r) => <ReviewCard key={r.id} review={r} />)
      ) : reviews.error ? null : (
        <ActivityIndicator color={c.primary} />
      )}
    </View>
  );
}

function ReviewCard({ review }: { review: Review }) {
  const t = useT();
  const [revealed, setRevealed] = useState(false);
  const hidden = review.contains_spoilers && !revealed;
  return (
    <Card>
      <T v="label">{review.author.username}</T>
      {hidden ? (
        <Pressable accessibilityRole="button" onPress={() => setRevealed(true)} style={{ minHeight: 44, justifyContent: 'center' }}>
          <T v="muted">{t('finishing.spoilerHidden')}</T>
        </Pressable>
      ) : (
        <T v="body">{review.body}</T>
      )}
    </Card>
  );
}
