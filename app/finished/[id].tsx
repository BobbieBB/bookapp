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
import { radius, space, useTheme } from '@/theme';

const STARS = [1, 2, 3, 4, 5];
const REVIEW_MAX = 10000;
const TARGET = 44;

export default function FinishedScreen() {
  const { c } = useTheme();
  const t = useT();
  const { session } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = session?.user.id;
  const page = useLookup(userId && id ? `${id}` : null, async () => {
    const { story, entry } = await loadStoryPage(id!, userId!);
    const finished = entry?.status === 'finished';
    const mine = finished && story.kind === 'book' ? await Promise.all([myRating(id!), myReview(id!)]) : null;
    return { story, finished, mine };
  });

  return (
    <ScrollView style={{ backgroundColor: c.ground }} contentContainerStyle={{ padding: space.xl, gap: space.l, flexGrow: 1 }}>
      {page.data ? (
        <Finished story={page.data.story} finished={page.data.finished} rating={page.data.mine?.[0] ?? null} review={page.data.mine?.[1] ?? null} />
      ) : page.error ? (
        <ErrorText>{t('finishing.loadFailed')}</ErrorText>
      ) : (
        // Saving "Finished" and loading the page can take a moment: a clear spinner, not a blank screen.
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 }}>
          <ActivityIndicator size="large" color={c.primary} accessibilityLabel={t('finishing.loading')} />
        </View>
      )}
    </ScrollView>
  );
}

function Finished({
  story,
  finished,
  rating: savedRating,
  review: savedReview,
}: {
  story: StoryDetails;
  finished: boolean;
  rating: number | null;
  review: { body: string; contains_spoilers: boolean } | null;
}) {
  const { fonts, c } = useTheme();
  const t = useT();
  const [error, setError] = useState('');
  const link = isAo3Link(story.source_url) ? story.source_url : null;
  // A WIP fic marked Finished: you're caught up, but The Epilogue (spoilers for the whole story)
  // only opens once it is complete, so don't offer a door that is locked.
  const wip = story.kind === 'fanfic' && story.status === 'ongoing';

  if (!finished) {
    return (
      <View style={{ gap: space.m }}>
        <T v="h2">{story.title}</T>
        <T v="body">{t('finishing.notFinished')}</T>
        <Button title={t('finishing.backToStory')} onPress={() => router.replace(`/story/${story.id}`)} />
      </View>
    );
  }

  return (
    <>
      <View accessible accessibilityRole="header" style={{ gap: space.s, paddingVertical: space.xl }}>
        <Text style={{ fontFamily: fonts.moment, fontSize: 44, lineHeight: 50, color: c.ink }}>
          {wip ? t('finishing.caughtUpTitle') : t('finishing.title')}
        </Text>
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

      {wip ? (
        <>
          <T v="body">{t('finishing.caughtUpHint')}</T>
          <Button title={t('finishing.backToStory')} onPress={() => router.back()} />
        </>
      ) : (
        <Button title={t('finishing.epilogue')} onPress={() => router.replace(`/room/${story.id}/epilogue`)} />
      )}
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
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed' | 'reviewFailed'>('idle');
  const nothingToSave = rating === null && !body.trim() && !hadReview;

  async function save() {
    if (nothingToSave) return;
    setStatus('saving');
    let ratingSaved = false;
    try {
      if (rating !== null) {
        await rateBook(storyId, rating);
        ratingSaved = true;
      }
      if (body.trim()) {
        await saveReview(storyId, body, spoilers);
        setHadReview(true);
      } else if (hadReview) {
        await deleteReview(storyId);
        setHadReview(false);
      }
      setStatus('saved');
    } catch {
      setStatus(ratingSaved ? 'reviewFailed' : 'failed');
    }
  }

  const edit = <A,>(set: (v: A) => void) => (v: A) => {
    setStatus('idle');
    set(v);
  };

  return (
    <View style={{ gap: space.m }}>
      <T v="overline">{t('finishing.yourRating')}</T>
      <View style={{ gap: space.xs }}>
        <View style={{ flexDirection: 'row', gap: space.xs }}>
          {STARS.map((value) => (
            <RateButton key={value} value={value} rating={rating} onRate={edit(setRating)} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: space.xs }}>
          {STARS.map((value) => (
            <RateButton key={value} value={value - 0.5} rating={rating} onRate={edit(setRating)} />
          ))}
        </View>
      </View>
      <Field label={t('finishing.reviewLabel')} value={body} onChangeText={edit(setBody)} multiline maxLength={REVIEW_MAX} />
      <Toggle label={t('finishing.spoilers')} value={spoilers} onChange={edit(setSpoilers)} />
      <Button title={t('finishing.save')} onPress={save} loading={status === 'saving'} disabled={nothingToSave} />
      {status === 'saved' ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite">
          <T v="label">{t('finishing.saved')}</T>
        </Text>
      ) : null}
      {status === 'failed' ? <ErrorText>{t('finishing.saveFailed')}</ErrorText> : null}
      {status === 'reviewFailed' ? <ErrorText>{t('finishing.reviewNotSaved')}</ErrorText> : null}
    </View>
  );
}

/** A rating button: whole stars on the first row, the half steps below. Each is at least 44 x 44. */
function RateButton({ value, rating, onRate }: { value: number; rating: number | null; onRate: (n: number) => void }) {
  const { c, fonts } = useTheme();
  const t = useT();
  const selected = rating === value;
  const lit = rating !== null && rating >= value;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('finishing.rate', { count: value })}
      accessibilityState={{ selected }}
      onPress={() => onRate(value)}
      style={{
        minWidth: TARGET,
        minHeight: TARGET,
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.s,
        borderWidth: 1.5,
        borderColor: selected ? c.primary : c.hairline,
        backgroundColor: lit ? c.primary : 'transparent',
      }}
    >
      <Text importantForAccessibility="no" style={{ fontFamily: fonts.bodyBold, fontSize: 16, color: lit ? c.surface : c.ink }}>
        {`${value}★`}
      </Text>
    </Pressable>
  );
}
