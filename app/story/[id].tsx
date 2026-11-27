import Feather from '@expo/vector-icons/Feather';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { ChapterSuggestions } from '@/components/ChapterSuggestions';
import { BookReviews } from '@/components/BookReviews';
import { StoryRooms } from '@/components/StoryRooms';
import { CoverActions, CoverEditButton, useCustomCover } from '@/components/CustomCover';
import { StoryCover } from '@/components/StoryCover';
import { useExplicitGate } from '@/components/ExplicitDialog';
import { ChoiceList, NumberWheel, Sheet } from '@/components/Sheet';
import { Button, Card, ErrorText, Field, T, Toggle } from '@/components/ui';
import { useT } from '@/i18n';
import { WARNING_LABEL, RATING_LABEL } from '@/lib/ao3Labels';
import { useAuth } from '@/lib/auth';
import { asksAdult } from '@/lib/explicit';
import { isAo3Link } from '@/lib/links';
import { FINISH, OPTION, sectionLabel } from '@/lib/sections';
import { progressLine, statusKey, type Translate } from '@/lib/library';
import { track } from '@/lib/analytics';
import { requestChapterCount } from '@/lib/moderation';
import { shareStory } from '@/lib/share';
import { addToLibrary, AO3_RATINGS, AO3_WARNINGS, removeFromLibrary, setFicLink } from '@/lib/stories';
import { normaliseAo3Link } from '@/lib/sources';
import {
  canComplete,
  canReopen,
  chapterCount,
  chaptersError,
  finishChapter,
  loadStoryPage,
  markComplete,
  nextChapter,
  reopen,
  setBookChapterCount,
  setChapter,
  setListened,
  setPage,
  setStatus,
  StoryUnavailable,
  finishStory,
  finishedFields,
  type MyEntry,
  type StoryDetails,
} from '@/lib/story';
import { type LibraryEntry, type LibraryStatus } from '@/lib/types';
import { useLookup } from '@/lib/useLookup';
import { radius, softShadow, space, useTheme } from '@/theme';

// No On Hold, and no Finished ("Caught up") on a WIP: a reader keeps Currently Reading until the story is complete
// (PO, 22 Nov 2026: two more statuses confused more than they helped). The database still knows both.
const STATUSES: LibraryStatus[] = ['currently_reading', 'want_to_read', 'finished', 'dnf'];

// The page wheel's end for a book whose page count we don't know.
const PAGE_WHEEL_MAX = 2000;

const isRating = (v: string | null): v is (typeof AO3_RATINGS)[number] => AO3_RATINGS.some((r) => r === v);
const isWarning = (v: string): v is (typeof AO3_WARNINGS)[number] => AO3_WARNINGS.some((w) => w === v);

export default function StoryScreen() {
  const { c } = useTheme();
  const t = useT();
  const { session } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = session?.user.id;
  const [version, setVersion] = useState(0);

  const page = useLookup(userId && id ? `${id}:${version}` : null, () => loadStoryPage(id!, userId!));
  const shown = page.data ?? (page.previous?.story.id === id ? page.previous : undefined);
  const reload = () => setVersion((v) => v + 1);
  useFocusEffect(useCallback(() => setVersion((v) => v + 1), []));

  return (
    <ScrollView style={{ backgroundColor: c.ground }} contentContainerStyle={{ padding: space.xl, gap: space.l }}>
      {shown && userId ? (
        <>
          <StoryBody story={shown.story} entry={shown.entry} userId={userId} onChanged={reload} />
          <StoryRooms storyId={shown.story.id} version={version} label={sectionLabel(shown.story)} />
          {shown.story.kind === 'book' ? <BookReviews storyId={shown.story.id} version={version} /> : null}
        </>
      ) : page.error instanceof StoryUnavailable ? (
        <View style={{ gap: space.m }}>
          <T v="h2">{t('story.unavailableTitle')}</T>
          <T v="muted">{t('story.unavailable')}</T>
          <Button variant="secondary" title={t('story.toHome')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        </View>
      ) : page.error ? (
        <View style={{ gap: space.m }}>
          <ErrorText>{t('story.loadFailed')}</ErrorText>
          <Button title={t('common.tryAgain')} onPress={reload} />
        </View>
      ) : (
        <ActivityIndicator color={c.signal} />
      )}
    </ScrollView>
  );
}

/** "Fandom  Harry Potter": a quiet label, then the value, so fandom and ship can't be mixed up. */
function LabelledLine({ label, value }: { label: string; value: string }) {
  const { c, fonts } = useTheme();
  return (
    <Text style={{ fontSize: 16, lineHeight: 22, color: c.ink, fontFamily: fonts.body }}>
      <Text style={{ fontFamily: fonts.bodyBold, color: c.muted }}>{label}  </Text>
      {value}
    </Text>
  );
}

function Tag({ label, tone = 'surface' }: { label: string; tone?: 'surface' | 'secondary' }) {
  const { c, mode, fonts } = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: radius.pill,
        backgroundColor: tone === 'secondary' ? c.secondary : c.surface,
        ...(tone === 'secondary' ? {} : softShadow(mode, 'small')),
      }}
    >
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: tone === 'secondary' ? c.onSecondary : c.inkSoft }}>{label}</Text>
    </View>
  );
}

/**
 * "Wrong chapter count?": once a count is set only a moderator changes it, so a reader who sees
 * a wrong one sends the right number (PO, 20 Oct 2026). One link, one field; after a successful
 * send the link is gone for this visit. The link sits under the title; the form, which needs
 * room, opens full width under the header (see `WrongChapterCountForm`).
 */
function useWrongChapterCount(storyId: string, current: number | null) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function send() {
    if (sending) return;
    const invalid = chaptersError(text, t);
    if (invalid) return setError(invalid);
    // The database refuses the count the book already has; say so instead of a vague failure.
    if (Number(text) === current) return setError(t('moderation.wrongCountSame'));
    setSending(true);
    setError('');
    try {
      await requestChapterCount(storyId, Number(text));
      setSent(true);
    } catch (e) {
      // 23505: you already have an open request for this book. Anything else (not allowed, too many today) is a plain failure.
      setError((e as { code?: string } | null)?.code === '23505' ? t('moderation.wrongCountDuplicate') : t('moderation.wrongCountFailed'));
    } finally {
      setSending(false);
    }
  }

  return {
    open,
    sent,
    sending,
    text,
    error,
    show: () => setOpen(true),
    cancel: () => {
      setOpen(false);
      setText('');
      setError('');
    },
    change: (v: string) => {
      setText(v);
      setError('');
    },
    send,
  };
}

type WrongChapterCount = ReturnType<typeof useWrongChapterCount>;

function WrongChapterCountLink({ wrong }: { wrong: WrongChapterCount }) {
  const { c, fonts } = useTheme();
  const t = useT();
  if (wrong.sent) return <T v="muted">{t('moderation.wrongCountThanks')}</T>;
  if (wrong.open) return null;
  return (
    <Pressable accessibilityRole="link" onPress={wrong.show} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.ink, textDecorationLine: 'underline' }}>{t('moderation.wrongCount')}</Text>
    </Pressable>
  );
}

function WrongChapterCountForm({ wrong }: { wrong: WrongChapterCount }) {
  const t = useT();
  if (!wrong.open || wrong.sent) return null;
  return (
    <View style={{ gap: space.s }}>
      <Field
        label={t('moderation.wrongCountField')}
        keyboardType="number-pad"
        value={wrong.text}
        onChangeText={wrong.change}
        placeholder={t('add.chaptersPlaceholder')}
        error={wrong.error || undefined}
      />
      <Button title={t('moderation.wrongCountSend')} onPress={wrong.send} loading={wrong.sending} />
      <Button variant="link" title={t('moderation.wrongCountCancel')} onPress={wrong.cancel} />
    </View>
  );
}

function StoryBody({
  story,
  entry: loaded,
  userId,
  onChanged,
}: {
  story: StoryDetails;
  entry: MyEntry | null;
  userId: string;
  onChanged: () => void;
}) {
  const { c, fonts } = useTheme();
  const t = useT();
  const { profile } = useAuth();
  const gate = useExplicitGate();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [error, setError] = useState('');
  const [countText, setCountText] = useState('');
  const [countError, setCountError] = useState('');
  const [pending, setPending] = useState<{ base: MyEntry | null; patch: Partial<MyEntry> }>({ base: null, patch: {} });
  const entry = loaded && pending.base === loaded ? { ...loaded, ...pending.patch } : loaded;
  const [statusOpen, setStatusOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  // The value on the chapter (or page) wheel while its sheet is open.
  const [wheel, setWheel] = useState<number | null>(null);
  // The chapter just finished on this visit: its progress glows until you do something else.
  const [justOpened, setJustOpened] = useState<number | null>(null);

  const myCover = useCustomCover(story.id, loaded !== null);
  const [coverOpen, setCoverOpen] = useState(false);
  const isFic = story.kind === 'fanfic';
  const count = chapterCount(story);
  const wrongCount = useWrongChapterCount(story.id, story.total_sections);

  /**
   * Runs one action at a time (a second tap while one is saving is ignored, so actions never
   * finish out of order), shows a failure instead of swallowing it, and reloads the page after.
   */
  async function act(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch {
      setError(t('story.actionFailed'));
    } finally {
      running.current = false;
      setBusy(false);
      onChanged();
    }
  }

  /** Once the change is saved it shows at once; the reload that follows replaces it with what the database holds. */
  const saved = (patch: Partial<MyEntry>, action: () => Promise<void>, afterSave?: () => void) =>
    act(async () => {
      await action();
      afterSave?.();
      setPending((p) => ({ base: loaded, patch: { ...(p.base === loaded ? p.patch : {}), ...patch } }));
    });

  const libraryEntry: LibraryEntry | null = entry
    ? { ...entry, story_id: story.id, updated_at: '', story }
    : null;
  const next = entry ? nextChapter(story, entry.progress_section) : null;
  const readAll =
    !!entry && entry.status !== 'finished' && !next && story.status !== 'ongoing' && story.has_chapters && !!count && entry.progress_section >= count;
  const markFinished = () =>
    saved(finishedFields(story), () => finishStory(story, userId), () => {
      void track('story_finished', { kind: story.kind });
      router.push(`/finished/${story.id}`);
    });
  const statuses = STATUSES.filter((s) => s !== 'finished' || story.status !== 'ongoing');
  const link = isAo3Link(story.source_url) ? story.source_url : null;
  // An Explicit fic asks the 18+ question before its link opens; nothing else on the page is hidden.
  const openLink = (url: string) =>
    gate.ask(asksAdult(story.content_rating, profile), () => {
      Linking.openURL(url).catch(() => setError(t('story.linkFailed')));
    });

  return (
    <>
      {gate.dialog}
      <View style={{ flexDirection: 'row', gap: space.l }}>
        <View style={{ width: 96, gap: space.xs }}>
          <View>
            <StoryCover story={story} customUrl={myCover.url} width={96} />
            {entry ? <CoverEditButton hasCover={!!myCover.url} onPress={() => setCoverOpen((o) => !o)} /> : null}
          </View>
        </View>
        <View style={{ flex: 1, gap: space.xs }}>
          <Text accessibilityRole="header" testID="story-title" style={{ fontFamily: fonts.bodyBold, fontSize: 24, lineHeight: 28, color: c.ink }}>
            {story.title}
          </Text>
          <T v="body">{story.author_name}</T>
          {story.has_chapters && count ? <T v="muted">{t('common.chapters', { count })}</T> : null}
          {entry && story.kind === 'book' && story.has_chapters && story.total_sections !== null ? <WrongChapterCountLink wrong={wrongCount} /> : null}
          {/* One story, never the library or how far you've read (PO, 16 Nov 2026). Not for a hidden story: its
              link would open for nobody else. */}
          {/* Lined up with the title, like "Wrong chapter count?" (PO, 20 Nov: it sat off to the right). */}
          {story.is_hidden ? null : (
            <View style={{ alignSelf: 'flex-start' }}>
              <Button
                variant="link"
                title={t('story.share')}
                onPress={() => shareStory(story, t).catch(() => setError(t('story.shareFailed')))}
              />
            </View>
          )}
        </View>
      </View>

      {entry ? <WrongChapterCountForm wrong={wrongCount} /> : null}

      {isFic ? (
        <View style={{ gap: space.s }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
            {story.status ? <Tag tone="secondary" label={story.status === 'ongoing' ? t('add.wip') : t('add.complete')} /> : null}
            {isRating(story.content_rating) ? <Tag label={t(RATING_LABEL[story.content_rating])} /> : null}
          </View>
          {story.fandoms.length ? <LabelledLine label={t('story.fandom')} value={story.fandoms.join(', ')} /> : null}
          {story.ships.length ? <LabelledLine label={t('story.ship')} value={story.ships.join(', ')} /> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
            {story.warnings.map((w) => (
              <Tag key={w} label={isWarning(w) ? t(WARNING_LABEL[w]) : w} />
            ))}
          </View>
          {link ? (
            <Pressable accessibilityRole="link" onPress={() => openLink(link)} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.ink, textDecorationLine: 'underline' }}>{t('story.allTags')}</Text>
            </Pressable>
          ) : !story.source_url && entry ? (
            <AddFicLink storyId={story.id} onAdded={onChanged} />
          ) : null}
        </View>
      ) : null}

      <ErrorText>{error}</ErrorText>

      {entry ? <CoverActions cover={myCover} open={coverOpen} onClose={() => setCoverOpen(false)} /> : null}

      {entry && libraryEntry ? (
        <Card style={{ gap: space.m }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s }}>
            <T v="overline">{t('story.yourLibrary').toUpperCase()}</T>
            <StatusButton label={t(statusKey(entry.status, story))} onPress={() => setStatusOpen(true)} />
          </View>
          {/* Audiobook or podfic (PO, 28 Nov 2026): the same rooms, chapter by chapter; only the format is yours. */}
          <Toggle
            label={t(story.kind === 'fanfic' ? 'story.listenedPodfic' : 'story.listenedAudiobook')}
            value={!!entry.listened}
            onChange={(v) => saved({ listened: v }, () => setListened(story.id, userId, v))}
          />

          {/* A Want to read book added without its chapter count: ask for it here, once. */}
          {story.kind === 'book' && story.has_chapters && count === null ? (
            <View style={{ gap: space.s }}>
              <T v="label">{t('story.countTitle')}</T>
              <T v="muted">{t('story.countHint')}</T>
              <Field
                label={t('add.chapters')}
                keyboardType="number-pad"
                value={countText}
                onChangeText={(v) => {
                  setCountText(v);
                  setCountError('');
                }}
                placeholder={t('add.chaptersPlaceholder')}
                error={countError || undefined}
              />
              <ChapterSuggestions
                book={{ title: story.title, author: story.author_name, excludeId: story.id }}
                onPick={(n) => {
                  setCountText(String(n));
                  setCountError('');
                }}
              />
              <Button
                variant="secondary"
                title={t('story.countSave')}
                loading={busy}
                onPress={() => {
                  const n = Number(countText);
                  const invalid = chaptersError(countText, t);
                  if (invalid) return setCountError(invalid);
                  void act(() => setBookChapterCount(story.id, n));
                }}
              />
            </View>
          ) : (
            <ProgressLine
              label={story.has_chapters ? progressLine(libraryEntry, t) : pageLine(entry.progress_page, story.page_count, t)}
              fraction={story.has_chapters ? (count ? entry.progress_section / count : null) : pageFraction(entry.progress_page, story.page_count)}
              glow={justOpened !== null}
              kind={story.kind}
              changeLabel={t(story.has_chapters ? 'story.changeChapter' : 'story.changePage')}
              onChange={() => setWheel(story.has_chapters ? entry.progress_section : (entry.progress_page ?? 0))}
            />
          )}

          {/* On a caught-up WIP you mostly wait: a new chapter is a quiet action, not the main button. */}
          {next ? (
            <Button
              variant={next.newlyPublished ? 'secondary' : 'primary'}
              title={next.newlyPublished ? t('story.chapterOut', { n: next.chapter }) : t(FINISH[sectionLabel(story)], { n: next.chapter })}
              onPress={() =>
                saved(
                  { progress_section: next.chapter },
                  async () => {
                    await finishChapter(story.id, userId, next);
                    void track('chapter_finished', { kind: story.kind });
                  },
                  () => {
                    // Finishing a chapter opens its discussion (PO, 16 Nov); back here, the progress glows.
                    setJustOpened(next.chapter);
                    router.push(`/room/${story.id}/${next.chapter}`);
                  },
                )
              }
            />
          ) : null}


          {/* Every chapter of a complete story read, but not marked Finished: say what opens The Epilogue
              instead of leaving it locked without a word (PO, 20 Nov 2026). The reader decides: someone
              rereading may not want it Finished. */}
          {readAll ? <Button title={t('story.finishStory')} onPress={markFinished} /> : null}

          {canComplete(story, entry.progress_section) ? (
            <Button variant="secondary" title={t('story.markComplete')} onPress={() => act(() => markComplete(story.id))} />
          ) : null}
          {canReopen(story, entry.progress_section) ? (
            <Button variant="link" title={t('story.reopen')} onPress={() => act(() => reopen(story.id))} />
          ) : null}

          <Sheet
            open={statusOpen}
            title={t('story.statusTitle')}
            onClose={() => {
              setStatusOpen(false);
              setRemoving(false);
            }}
          >
            <ChoiceList
              options={statuses.map((s) => ({ value: s, label: t(statusKey(s, story)) }))}
              value={entry.status}
              onPick={(s) => {
                setStatusOpen(false);
                if (s === entry.status) return;
                setJustOpened(null);
                if (s === 'finished') markFinished();
                else saved({ status: s }, () => setStatus(story.id, userId, s));
              }}
            />
            {/* Take it out of the library (PO, 27 Nov 2026), asked twice: progress can't be brought back.
                Inline, not an alert: alerts don't show on the web version. */}
            {removing ? (
              <View style={{ gap: space.s }}>
                <T v="muted">{t('story.removeExplain')}</T>
                <Button
                  variant="secondary"
                  title={t('story.removeConfirm')}
                  onPress={() => {
                    setStatusOpen(false);
                    setRemoving(false);
                    void act(() => removeFromLibrary(story.id));
                  }}
                />
                <Button variant="link" title={t('story.removeCancel')} onPress={() => setRemoving(false)} />
              </View>
            ) : (
              <Button variant="link" title={t('story.remove')} onPress={() => setRemoving(true)} />
            )}
          </Sheet>

          <Sheet open={wheel !== null} title={t(story.has_chapters ? 'story.chapterPicker' : 'story.pagePicker')} onClose={() => setWheel(null)}>
            {wheel !== null ? (
              <NumberWheel
                min={0}
                max={story.has_chapters ? Math.max(count ?? 0, entry.progress_section) : Math.max(story.page_count ?? PAGE_WHEEL_MAX, entry.progress_page ?? 0)}
                value={wheel}
                onChange={setWheel}
                label={(n) => (n === 0 ? t('library.notStarted') : t(story.has_chapters ? OPTION[sectionLabel(story)] : 'story.pageOption', { n }))}
                testIDPrefix={story.has_chapters ? 'chapter-option' : 'page-option'}
              />
            ) : null}
            <Button
              title={t('story.done')}
              onPress={() => {
                const n = wheel;
                setWheel(null);
                if (n === null) return;
                setJustOpened(null);
                if (story.has_chapters) {
                  if (n !== entry.progress_section) saved({ progress_section: n }, () => setChapter(story.id, userId, n));
                } else if (n !== (entry.progress_page ?? 0)) {
                  saved({ progress_page: n }, () => setPage(story.id, userId, n));
                }
              }}
            />
          </Sheet>
        </Card>
      ) : (
        <Button title={t('story.addToLibrary')} onPress={() => act(() => addToLibrary(story.id, "want_to_read"))} loading={busy} />
      )}
    </>
  );
}

function pageLine(page: number | null, pageCount: number | null, t: Translate): string {
  if (!page) return t('library.notStarted');
  return pageCount ? t('story.pageOf', { n: page, total: pageCount }) : t('story.pageAt', { n: page });
}

function pageFraction(page: number | null, pageCount: number | null): number | null {
  return page !== null && pageCount ? Math.min(1, page / pageCount) : null;
}

/** "Reading ▾": the status, as a button that opens the list of statuses. */
function StatusButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { c, mode, fonts } = useTheme();
  const t = useT();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('story.statusButton', { status: label })}
      onPress={onPress}
      style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: c.surface, ...softShadow(mode, 'small') }}
    >
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.ink }}>{label}</Text>
      <Feather name="chevron-down" size={18} color={c.ink} />
    </Pressable>
  );
}

/** "Finished chapter 23 of 40", a bar, and Change. Mint for a moment after a chapter is finished. */
function ProgressLine({
  label,
  fraction,
  glow,
  kind,
  changeLabel,
  onChange,
}: {
  label: string;
  fraction: number | null;
  glow: boolean;
  kind: StoryDetails['kind'];
  changeLabel: string;
  onChange: () => void;
}) {
  const { c, fonts } = useTheme();
  const fill = glow ? c.secondary : kind === 'fanfic' ? c.progressAlt : c.progress;
  return (
    <View style={{ gap: space.s }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s }}>
        <Text testID="progress-line" style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 17, color: glow ? c.success : c.ink }}>
          {label}
        </Text>
        <Pressable accessibilityRole="button" onPress={onChange} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.ink, textDecorationLine: 'underline' }}>{changeLabel}</Text>
        </Pressable>
      </View>
      {fraction !== null ? (
        <View style={{ height: 8, borderRadius: 999, backgroundColor: c.track, overflow: 'hidden' }}>
          <View style={{ height: '100%', borderRadius: 999, width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`, backgroundColor: fill }} />
        </View>
      ) : null}
    </View>
  );
}


/** A fic added without a link (decision G): "Add the AO3 link", once a reader has it. */
function AddFicLink({ storyId, onAdded }: { storyId: string; onAdded: () => void }) {
  const { c, fonts } = useTheme();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    const canonical = normaliseAo3Link(text);
    if (!canonical) return setError(t('add.badLink'));
    setSaving(true);
    setError('');
    try {
      await setFicLink(storyId, canonical);
      onAdded();
    } catch (e) {
      setError((e as { code?: string } | null)?.code === '23505' ? t('story.linkTaken') : t('story.actionFailed'));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.ink, textDecorationLine: 'underline' }}>{t('story.addLink')}</Text>
      </Pressable>
    );
  }
  return (
    <View style={{ gap: space.s }}>
      <Field
        label={t('add.ao3Link')}
        placeholder={t('add.ao3Placeholder')}
        value={text}
        onChangeText={(v) => {
          setText(v);
          setError('');
        }}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        error={error || undefined}
      />
      <Button variant="secondary" title={t('story.linkSave')} onPress={() => void save()} loading={saving} />
    </View>
  );
}
