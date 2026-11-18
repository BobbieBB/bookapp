import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { useExplicitGate } from '@/components/ExplicitDialog';
import { Button, ErrorText, Field, T, Toggle } from '@/components/ui';
import { useLanguage, useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { asksAdult } from '@/lib/explicit';
import { isAo3Link } from '@/lib/links';
import { deleteReview, myRating, myReview, rateBook, saveReview } from '@/lib/reviews';
import { canComplete, loadStoryPage, markComplete, type StoryDetails } from '@/lib/story';
import { useLookup } from '@/lib/useLookup';
import { space, useTheme } from '@/theme';

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
    return { story, finished, mine, progress: entry?.progress_section ?? 0 };
  });

  return (
    <ScrollView style={{ backgroundColor: c.ground }} contentContainerStyle={{ padding: space.xl, gap: space.l, flexGrow: 1 }}>
      {page.data ? (
        <Finished story={page.data.story} finished={page.data.finished} progress={page.data.progress} rating={page.data.mine?.[0] ?? null} review={page.data.mine?.[1] ?? null} />
      ) : page.error ? (
        <ErrorText>{t('finishing.loadFailed')}</ErrorText>
      ) : (
        // Saving "Finished" and loading the page can take a moment: a clear spinner, not a blank screen.
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 }}>
          <ActivityIndicator size="large" color={c.signal} accessibilityLabel={t('finishing.loading')} />
        </View>
      )}
    </ScrollView>
  );
}

function Finished({
  story,
  finished,
  progress,
  rating: savedRating,
  review: savedReview,
}: {
  story: StoryDetails;
  finished: boolean;
  progress: number;
  rating: number | null;
  review: { body: string; contains_spoilers: boolean } | null;
}) {
  const { fonts, c } = useTheme();
  const t = useT();
  const { profile } = useAuth();
  const gate = useExplicitGate();
  const [error, setError] = useState('');
  const link = isAo3Link(story.source_url) ? story.source_url : null;
  // An Explicit fic asks the 18+ question before its AO3 link or The Epilogue opens. Admins skip the dialog for
  // rooms, The Epilogue included (they moderate them), but are asked before the AO3 link like everyone.
  const explicit = asksAdult(story.content_rating, profile);
  // A WIP fic marked Finished: you're caught up, but The Epilogue (spoilers for the whole story)
  // only opens once it is complete, so don't offer a door that is locked.
  const wip = story.kind === 'fanfic' && story.status === 'ongoing';
  const [completing, setCompleting] = useState(false);

  // The usual case: the reader just read the last chapter, but Livami still has it as a WIP.
  // Finished is always opened on top of the story (the Finished chip, or Add): Back is the way, and a deep link
  // with nothing behind it goes to the story instead of nowhere.
  function backToStory() {
    if (router.canGoBack()) router.back();
    else router.replace(`/story/${story.id}`);
  }

  async function complete() {
    setCompleting(true);
    setError('');
    try {
      await markComplete(story.id);
      router.replace(`/room/${story.id}/epilogue`);
    } catch {
      setError(t('finishing.completeFailed'));
      setCompleting(false);
    }
  }

  if (!finished) {
    return (
      <View style={{ gap: space.m }}>
        <T v="h2">{story.title}</T>
        <T v="body">{t('finishing.notFinished')}</T>
        <Button title={t('finishing.backToStory')} onPress={backToStory} />
      </View>
    );
  }

  return (
    <>
      {gate.dialog}
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
                gate.ask(explicit, () => {
                  Linking.openURL(link).catch(() => setError(t('finishing.linkFailed')));
                });
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
          {canComplete(story, progress) ? (
            <View style={{ gap: space.s }}>
              <T v="label">{t('finishing.completeQuestion')}</T>
              <Button title={t('finishing.markComplete')} onPress={complete} loading={completing} />
            </View>
          ) : null}
          <Button variant={canComplete(story, progress) ? 'secondary' : 'primary'} title={t('finishing.backToStory')} onPress={backToStory} />
        </>
      ) : (
        <Button
          title={t('finishing.epilogue')}
          onPress={() => gate.ask(explicit && !profile?.is_admin, () => router.replace(`/room/${story.id}/epilogue`))}
        />
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
      <StarPicker rating={rating} onRate={edit(setRating)} />
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

/**
 * Five stars (PO, phone test 16 Nov 2026). Tap a star for that many; tap the same star again for half a star less,
 * and again to go back. Each star is at least 44 x 44; the rating is also written out next to them.
 */
function StarPicker({ rating, onRate }: { rating: number | null; onRate: (n: number) => void }) {
  const t = useT();
  const { language } = useLanguage();
  // "4.5 stars" / "4,5 звезди": Bulgarian writes a decimal comma. `count` still picks the plural form.
  const said = rating === null ? null : t('finishing.yourStars', { count: rating, stars: language === 'bg' ? String(rating).replace('.', ',') : String(rating) });
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
      {STARS.map((value) => (
        <StarButton
          key={value}
          value={value}
          rating={rating}
          hint={t('finishing.rateHalfHint')}
          said={said}
          // The same star again toggles between whole and half: 4 → 3.5 → 4.
          onRate={() => onRate(rating === value ? value - 0.5 : value)}
        />
      ))}
      {said !== null ? <T v="label">{said}</T> : null}
    </View>
  );
}

// Every glyph sits in a box of this width, so the half star's clip (half the box) is exactly half a star and the
// clipped text never wraps or gets cut short with "…".
const STAR_BOX = 36;

function StarButton({
  value,
  rating,
  hint,
  said,
  onRate,
}: {
  value: number;
  rating: number | null;
  hint: string;
  said: string | null;
  onRate: () => void;
}) {
  const { c } = useTheme();
  const t = useT();
  // How much of this star is filled: all, half (4.5 fills the fifth star half) or none.
  const fill = rating === null ? 0 : rating >= value ? 1 : rating >= value - 0.5 ? 0.5 : 0;
  // Stars are marks that must show (3:1, WCAG 1.4.11): `signal` in every palette, an outline when empty.
  const glyph = { width: STAR_BOX, textAlign: 'center', fontSize: 34, lineHeight: 40, color: c.signal } as const;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('finishing.rate', { count: value })}
      accessibilityHint={hint}
      // Selected only on the exact value; the value itself ("4.5 stars") is read out, so a half isn't heard as whole.
      accessibilityState={{ selected: rating === value }}
      accessibilityValue={said ? { text: said } : undefined}
      onPress={onRate}
      style={{ minWidth: TARGET, minHeight: TARGET, alignItems: 'center', justifyContent: 'center' }}
    >
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ width: STAR_BOX }}>
        <Text style={glyph}>{fill === 1 ? '★' : '☆'}</Text>
        {fill === 0.5 ? (
          <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: STAR_BOX / 2, overflow: 'hidden' }}>
            <Text numberOfLines={1} style={glyph}>
              ★
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
