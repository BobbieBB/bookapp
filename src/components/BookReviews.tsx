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
  const found = useLookup(`${storyId}:${version}`, async () => {
    const [stats, reviews] = await Promise.all([bookStats(storyId), loadReviews(storyId)]);
    return { stats, reviews };
  });
  const shown = found.data ?? found.previous;

  return (
    <View style={{ gap: space.s }}>
      {shown?.stats && shown.stats.count > 0 ? (
        <T v="label">{t('finishing.ratings', { average: shown.stats.average.toFixed(1), count: shown.stats.count })}</T>
      ) : null}
      <T v="overline">{t('finishing.reviews')}</T>
      {found.error ? <ErrorText>{t('finishing.reviewsFailed')}</ErrorText> : null}
      {shown ? shown.reviews.map((r) => <ReviewCard key={r.id} review={r} />) : <ActivityIndicator color={c.primary} />}
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
