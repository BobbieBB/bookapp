import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useEffect, useRef, useState, type ComponentRef, type RefObject } from 'react';
import { ActivityIndicator, Keyboard, Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { useCustomCover } from '@/components/CustomCover';
import { useExplicitGate } from '@/components/ExplicitDialog';
import { StoryCover } from '@/components/StoryCover';
import { Button, ErrorText, Field, T, Toggle } from '@/components/ui';
import { useLanguage, useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { asksAdult } from '@/lib/explicit';
import { isAo3Link } from '@/lib/links';
import { deleteReview, myRating, myReview, rateBook, saveReview } from '@/lib/reviews';
import { canComplete, loadStoryPage, markComplete, type StoryDetails } from '@/lib/story';
import { useLookup } from '@/lib/useLookup';
import { radius, space, useTheme } from '@/theme';
import { useKeyboardSpace } from '@/lib/keyboard';

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

  // The review field is near the end: when the keyboard opens, scroll so it and its buttons stay in view
  // (PO, 22 Nov 2026: the keyboard hid what was being typed). Same as the discussion rooms.
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const kb = useKeyboardSpace(scroll);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50));
    return () => shown.remove();
  }, []);

  return (
    <ScrollView
      ref={scroll}
      style={{ backgroundColor: c.ground }}
      onScroll={kb.onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={{ padding: space.xl, paddingBottom: space.xl + kb.bottom, gap: space.l, flexGrow: 1 }}
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
    >
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
  const [joining, setJoining] = useState(false);
  const saveDraftRef = useRef<(() => Promise<boolean>) | null>(null);
  const myCover = useCustomCover(story.id, true);

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

  // Join The Epilogue saves a review still being written first, so nothing typed is lost (PO, 20 Nov 2026).
  async function joinEpilogue() {
    setJoining(true);
    const saved = (await saveDraftRef.current?.()) ?? true;
    setJoining(false);
    if (saved) gate.ask(explicit && !profile?.is_admin, () => router.replace(`/room/${story.id}/epilogue`));
  }

  return (
    <>
      {gate.dialog}
      {/* The story is the hero: its cover, then its title, larger than "You finished it!" (PO, 20 Nov 2026). */}
      <View accessible accessibilityRole="header" style={{ alignItems: 'center', gap: space.s, paddingTop: space.m, paddingBottom: space.s }}>
        <Text style={{ fontFamily: fonts.moment, fontSize: 28, lineHeight: 34, color: c.ink, textAlign: 'center' }}>
          {wip ? t('finishing.caughtUpTitle') : t('finishing.title')}
        </Text>
        <View style={{ marginVertical: space.s }}>
          <StoryCover story={story} customUrl={myCover.url} width={132} />
        </View>
        <Text style={{ fontFamily: fonts.display, fontSize: 26, lineHeight: 32, color: c.ink, textAlign: 'center' }}>{story.title}</Text>
        <T v="muted">{story.author_name}</T>
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
        <BookRating storyId={story.id} rating={savedRating} review={savedReview} saveDraftRef={saveDraftRef} />
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
        <Button title={t('finishing.epilogue')} onPress={joinEpilogue} loading={joining} />
      )}
    </>
  );
}

type Review = { body: string; contains_spoilers: boolean };

/**
 * Stars save as soon as you tap them. The review is written, then saved with "Save review"; once saved it
 * shows read-only with a green tick and "Edit" (PO, 20 Nov 2026: after Save the form looked unchanged).
 * `saveDraftRef` lets Join The Epilogue save a review that is still being written.
 */
function BookRating({
  storyId,
  rating: initialRating,
  review,
  saveDraftRef,
}: {
  storyId: string;
  rating: number | null;
  review: Review | null;
  saveDraftRef: RefObject<(() => Promise<boolean>) | null>;
}) {
  const t = useT();
  const { c, fonts } = useTheme();
  const [rating, setRating] = useState(initialRating);
  const [ratingFailed, setRatingFailed] = useState(false);
  // "Saved" under the stars once the latest tap is in the database (PO, 27 Nov 2026: no sign that it saved).
  const [ratingSaved, setRatingSaved] = useState(false);
  const lastTap = useRef(0);
  const [saved, setSaved] = useState<Review | null>(review);
  const [editing, setEditing] = useState(!review);
  const [body, setBody] = useState(review?.body ?? '');
  const [spoilers, setSpoilers] = useState(review?.contains_spoilers ?? false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'failed'>('idle');
  const dirty = editing && (body.trim() !== (saved?.body ?? '') || spoilers !== (saved?.contains_spoilers ?? false));

  const ratingSaves = useRef<Promise<unknown>>(Promise.resolve());

  async function rate(value: number) {
    const before = rating;
    setRating(value);
    setRatingFailed(false);
    setRatingSaved(false);
    const tap = ++lastTap.current;
    // Taps save one after another, so two quick taps (5, then 4.5) can't land in the wrong order and leave 5.
    const save = ratingSaves.current.catch(() => undefined).then(() => rateBook(storyId, value));
    ratingSaves.current = save;
    try {
      await save;
      if (tap === lastTap.current) setRatingSaved(true);
    } catch {
      setRating(before);
      setRatingFailed(true);
    }
  }

  /** Saves the review being written; true when there was nothing to save or it saved. */
  async function saveReviewNow(): Promise<boolean> {
    if (!dirty) return true;
    setStatus('saving');
    try {
      if (body.trim()) {
        await saveReview(storyId, body, spoilers);
        setSaved({ body: body.trim(), contains_spoilers: spoilers });
        setEditing(false);
      } else {
        await deleteReview(storyId);
        setSaved(null);
      }
      setStatus('idle');
      return true;
    } catch {
      setStatus('failed');
      return false;
    }
  }
  // Join The Epilogue calls the latest one (it sees the text typed so far).
  useEffect(() => {
    saveDraftRef.current = saveReviewNow;
  });

  return (
    <View style={{ gap: space.m }}>
      <T v="overline">{t('finishing.yourRating')}</T>
      <StarPicker rating={rating} onRate={(v) => void rate(v)} />
      {ratingFailed ? <ErrorText>{t('finishing.saveFailed')}</ErrorText> : null}
      {ratingSaved && !ratingFailed ? (
        <View accessible accessibilityRole="text" accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          <Feather name="check-circle" size={18} color={c.success} />
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.success }}>{t('finishing.ratingSaved')}</Text>
        </View>
      ) : null}

      {saved && !editing ? (
        <View style={{ gap: space.s }}>
          <View style={{ borderRadius: radius.s, borderWidth: 1.5, borderColor: c.hairline, padding: space.m, opacity: 0.85 }}>
            <Text style={{ fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: c.inkSoft }}>{saved.body}</Text>
            {saved.contains_spoilers ? <T v="muted">{t('finishing.spoilers')}</T> : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s }}>
            <View accessible accessibilityRole="text" style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1 }}>
              <Feather name="check-circle" size={18} color={c.success} />
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.success }}>{t('finishing.saved')}</Text>
            </View>
            <Button variant="link" title={t('finishing.editReview')} onPress={() => setEditing(true)} />
          </View>
          <T v="muted">{t('finishing.reviewOnPage')}</T>
        </View>
      ) : (
        <>
          <Field
            label={t('finishing.reviewLabel')}
            value={body}
            onChangeText={(v) => {
              setStatus('idle');
              setBody(v);
            }}
            multiline
            maxLength={REVIEW_MAX}
          />
          <Toggle label={t('finishing.spoilers')} value={spoilers} onChange={setSpoilers} />
          <Button variant="secondary" title={t('finishing.saveReview')} onPress={() => void saveReviewNow()} loading={status === 'saving'} disabled={!dirty} />
        </>
      )}
      {status === 'failed' ? <ErrorText>{t('finishing.reviewNotSaved')}</ErrorText> : null}
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
// clipped text never wraps or gets cut short with "…". Wider than the glyph: at 36 the iPhone's ★ lost its right
// point (PO, 22 Nov 2026); 44 is also the touch target.
const STAR_BOX = 44;

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
            {/* A full-width box inside the half-width clip, so the filled star sits exactly on the outline one.
                Sizing the text itself let the web version shrink it to the clip and shift it left (PO, 27 Nov 2026). */}
            <View style={{ position: 'absolute', left: 0, top: 0, width: STAR_BOX, flexShrink: 0 }}>
              <Text style={glyph}>★</Text>
            </View>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
