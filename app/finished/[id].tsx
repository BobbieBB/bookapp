import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { Button, ErrorText, Field, T, Toggle } from '@/components/ui';
import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { isAo3Link } from '@/lib/links';
import { deleteReview, myRating, myReview, rateBook, saveReview } from '@/lib/reviews';
import { loadStoryPage, type StoryDetails } from '@/lib/story';
import { useLookup } from '@/lib/useLookup';
import { space, useTheme } from '@/theme';

const STARS = [1, 2, 3, 4, 5];
const STAR_SIZE = 48;

export default function FinishedScreen() {
  const { c } = useTheme();
  const t = useT();
  const { session } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = session?.user.id;
  const page = useLookup(userId && id ? `${id}` : null, async () => {
    const { story } = await loadStoryPage(id!, userId!);
    const mine = story.kind === 'book' ? await Promise.all([myRating(id!), myReview(id!)]) : null;
    return { story, mine };
  });

  return (
    <ScrollView style={{ backgroundColor: c.ground }} contentContainerStyle={{ padding: space.xl, gap: space.l }}>
      {page.data ? (
        <Finished story={page.data.story} rating={page.data.mine?.[0] ?? null} review={page.data.mine?.[1] ?? null} />
      ) : page.error ? (
        <ErrorText>{t('finishing.loadFailed')}</ErrorText>
      ) : (
        <ActivityIndicator color={c.primary} />
      )}
    </ScrollView>
  );
}

function Finished({
  story,
  rating: savedRating,
  review: savedReview,
}: {
  story: StoryDetails;
  rating: number | null;
  review: { body: string; contains_spoilers: boolean } | null;
}) {
  const { fonts, c } = useTheme();
  const t = useT();
  const [error, setError] = useState('');
  const link = isAo3Link(story.source_url) ? story.source_url : null;

  return (
    <>
      <View accessible accessibilityRole="header" style={{ gap: space.s, paddingVertical: space.xl }}>
        <Text style={{ fontFamily: fonts.moment, fontSize: 44, lineHeight: 50, color: c.ink }}>{t('finishing.title')}</Text>
        <T v="h2">{story.title}</T>
      </View>

      {story.kind === 'fanfic' ? (
        <View style={{ gap: space.s }}>
          <T v="body">{t('finishing.ficHint')}</T>
          {link ? (
            <Button
              variant="secondary"
              title={t('finishing.openAo3')}
              onPress={() => {
                setError('');
                Linking.openURL(link).catch(() => setError(t('finishing.linkFailed')));
              }}
            />
          ) : null}
          <ErrorText>{error}</ErrorText>
        </View>
      ) : (
        <BookRating storyId={story.id} rating={savedRating} review={savedReview} />
      )}

      <Button title={t('finishing.epilogue')} onPress={() => router.push(`/room/${story.id}/epilogue`)} />
    </>
  );
}

function BookRating({
  storyId,
  rating: initialRating,
  review,
}: {
  storyId: string;
  rating: number | null;
  review: { body: string; contains_spoilers: boolean } | null;
}) {
  const t = useT();
  const [rating, setRating] = useState(initialRating);
  const [body, setBody] = useState(review?.body ?? '');
  const [spoilers, setSpoilers] = useState(review?.contains_spoilers ?? false);
  const [hadReview, setHadReview] = useState(!!review);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  async function save() {
    setStatus('saving');
    try {
      if (rating !== null) await rateBook(storyId, rating);
      if (body.trim()) {
        await saveReview(storyId, body, spoilers);
        setHadReview(true);
      } else if (hadReview) {
        await deleteReview(storyId);
        setHadReview(false);
      }
      setStatus('saved');
    } catch {
      setStatus('failed');
    }
  }

  const edit = <A,>(set: (v: A) => void) => (v: A) => {
    setStatus('idle');
    set(v);
  };

  return (
    <View style={{ gap: space.m }}>
      <T v="overline">{t('finishing.yourRating')}</T>
      <View style={{ flexDirection: 'row' }}>
        {STARS.map((star) => (
          <Star key={star} star={star} rating={rating} onRate={edit(setRating)} />
        ))}
      </View>
      <Field label={t('finishing.reviewLabel')} value={body} onChangeText={edit(setBody)} multiline />
      <Toggle label={t('finishing.spoilers')} value={spoilers} onChange={edit(setSpoilers)} />
      <Button title={t('finishing.save')} onPress={save} loading={status === 'saving'} />
      {status === 'saved' ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite">
          <T v="label">{t('finishing.saved')}</T>
        </Text>
      ) : null}
      {status === 'failed' ? <ErrorText>{t('finishing.saveFailed')}</ErrorText> : null}
    </View>
  );
}

/** One star made of two pressable halves: the left half rates star − 0.5, the right half rates star. */
function Star({ star, rating, onRate }: { star: number; rating: number | null; onRate: (n: number) => void }) {
  const { c, fonts } = useTheme();
  const t = useT();
  const fill = rating === null ? 0 : rating >= star ? 1 : rating >= star - 0.5 ? 0.5 : 0;
  const glyph = { fontFamily: fonts.body, fontSize: 40, lineHeight: STAR_SIZE, textAlign: 'center' as const, width: STAR_SIZE };

  return (
    <View style={{ width: STAR_SIZE, height: STAR_SIZE }}>
      <Text importantForAccessibility="no" style={[glyph, { color: c.hairline, position: 'absolute' }]}>
        ★
      </Text>
      <View pointerEvents="none" style={{ position: 'absolute', width: STAR_SIZE * fill, height: STAR_SIZE, overflow: 'hidden' }}>
        <Text importantForAccessibility="no" style={[glyph, { color: c.primary }]}>
          ★
        </Text>
      </View>
      <View style={{ flexDirection: 'row', position: 'absolute', width: STAR_SIZE, height: STAR_SIZE }}>
        {[star - 0.5, star].map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={t('finishing.rate', { n: value })}
            accessibilityState={{ selected: rating === value }}
            onPress={() => onRate(value)}
            style={{ flex: 1, height: STAR_SIZE }}
          />
        ))}
      </View>
    </View>
  );
}
