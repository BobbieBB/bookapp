import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { BookReviews } from '@/components/BookReviews';
import { StoryRooms } from '@/components/StoryRooms';
import { CoverActions, useCustomCover } from '@/components/CustomCover';
import { Button, Card, Chip, ErrorText, Field, T } from '@/components/ui';
import { useT } from '@/i18n';
import { WARNING_LABEL, RATING_LABEL } from '@/lib/ao3Labels';
import { useAuth } from '@/lib/auth';
import { isAo3Link } from '@/lib/links';
import { progressLine } from '@/lib/library';
import { addToLibrary, AO3_RATINGS, AO3_WARNINGS } from '@/lib/stories';
import {
  canComplete,
  canReopen,
  chapterCount,
  finishChapter,
  loadStoryPage,
  markComplete,
  nextChapter,
  pagePercent,
  reopen,
  setChapter,
  setPage,
  setStatus,
  type MyEntry,
  type StoryDetails,
} from '@/lib/story';
import { STATUS_KEY, type LibraryEntry, type LibraryStatus } from '@/lib/types';
import { useLookup } from '@/lib/useLookup';
import { coverColor, radius, softShadow, space, useTheme } from '@/theme';

const STATUSES: LibraryStatus[] = ['currently_reading', 'want_to_read', 'finished', 'dnf', 'on_hold'];

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
          <StoryRooms storyId={shown.story.id} version={version} />
          {shown.story.kind === 'book' ? <BookReviews storyId={shown.story.id} version={version} /> : null}
        </>
      ) : page.error ? (
        <View style={{ gap: space.m }}>
          <ErrorText>{t('story.loadFailed')}</ErrorText>
          <Button title={t('common.tryAgain')} onPress={reload} />
        </View>
      ) : (
        <ActivityIndicator color={c.primary} />
      )}
    </ScrollView>
  );
}

function Cover({ story, customUrl }: { story: StoryDetails; customUrl: string | null }) {
  const th = useTheme();
  const t = useT();
  const { fonts } = th;
  const size = { width: 96, height: 140, borderRadius: 14, ...softShadow(th.isDark, 'small') };
  const label = t('library.coverLabel', { title: story.title });
  if (customUrl) {
    return <Image source={{ uri: customUrl }} accessibilityLabel={t('covers.customLabel', { title: story.title })} style={size} />;
  }
  if (story.kind === 'book' && story.cover_url) {
    return <Image source={{ uri: story.cover_url }} accessibilityLabel={label} style={size} />;
  }
  const cover = coverColor(story.id, th.isDark);
  return (
    <View accessible accessibilityLabel={label} style={[size, { backgroundColor: cover.bg, justifyContent: 'space-between', padding: 8 }]}>
      <Text numberOfLines={5} style={{ fontFamily: fonts.moment, fontSize: 20, lineHeight: 20, color: cover.fg }}>
        {story.title}
      </Text>
      <Text numberOfLines={2} style={{ fontFamily: fonts.bodyBold, fontSize: 9, lineHeight: 10, letterSpacing: 0.2, color: cover.fg }}>
        {story.author_name.toUpperCase()}
      </Text>
    </View>
  );
}

function Tag({ label, tone = 'surface' }: { label: string; tone?: 'surface' | 'secondary' }) {
  const { c, isDark, fonts } = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: radius.pill,
        backgroundColor: tone === 'secondary' ? c.secondary : c.surface,
        ...(tone === 'secondary' ? {} : softShadow(isDark, 'small')),
      }}
    >
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: tone === 'secondary' ? c.onSecondary : c.inkSoft }}>{label}</Text>
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
  const { c, isDark, fonts } = useTheme();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);
  const [pending, setPending] = useState<{ base: MyEntry | null; patch: Partial<MyEntry> }>({ base: null, patch: {} });
  const entry = loaded && pending.base === loaded ? { ...loaded, ...pending.patch } : loaded;
  const [pageText, setPageText] = useState(entry?.progress_page?.toString() ?? '');

  const myCover = useCustomCover(story.id, loaded !== null);
  const isFic = story.kind === 'fanfic';
  const count = chapterCount(story);

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

  async function savePage() {
    const n = Number(pageText);
    if (!/^\d+$/.test(pageText.trim()) || !Number.isSafeInteger(n)) {
      setError(t('story.pageInvalid'));
      return;
    }
    await act(() => setPage(story.id, userId, n));
  }

  const libraryEntry: LibraryEntry | null = entry
    ? { ...entry, story_id: story.id, updated_at: '', story }
    : null;
  const next = entry ? nextChapter(story, entry.progress_section) : null;
  const percent = entry ? pagePercent(entry.progress_page, story.page_count) : null;
  const statuses = STATUSES.filter((s) => s !== 'on_hold' || isFic);
  const link = isAo3Link(story.source_url) ? story.source_url : null;

  return (
    <>
      <View style={{ flexDirection: 'row', gap: space.l }}>
        <View style={{ width: 96, gap: space.xs }}>
          <Cover story={story} customUrl={myCover.url} />
          {myCover.url ? <T v="muted">{t('covers.onlyYou')}</T> : null}
        </View>
        <View style={{ flex: 1, gap: space.xs }}>
          <Text accessibilityRole="header" testID="story-title" style={{ fontFamily: fonts.display, fontSize: 26, letterSpacing: -0.5, color: c.ink }}>
            {story.title}
          </Text>
          <T v="body">{story.author_name}</T>
          {story.has_chapters && count ? <T v="muted">{t('common.chapters', { count })}</T> : null}
        </View>
      </View>

      {isFic ? (
        <View style={{ gap: space.s }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
            {story.status ? <Tag tone="secondary" label={story.status === 'ongoing' ? t('add.wip') : t('add.complete')} /> : null}
            {isRating(story.content_rating) ? <Tag label={t(RATING_LABEL[story.content_rating])} /> : null}
          </View>
          {story.fandoms.map((f) => (
            <T key={f} v="label">
              {f}
            </T>
          ))}
          {story.ships.map((s) => (
            <T key={s} v="body">
              {s}
            </T>
          ))}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
            {story.warnings.map((w) => (
              <Tag key={w} label={isWarning(w) ? t(WARNING_LABEL[w]) : w} />
            ))}
          </View>
          {link ? (
            <Pressable accessibilityRole="link" onPress={() => Linking.openURL(link).catch(() => setError(t('story.linkFailed')))} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.ink, textDecorationLine: 'underline' }}>{t('story.allTags')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <ErrorText>{error}</ErrorText>

      {entry ? <CoverActions cover={myCover} /> : null}

      {entry && libraryEntry ? (
        <Card style={{ gap: space.m }}>
          <T v="overline">{t('story.yourLibrary').toUpperCase()}</T>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
            {statuses.map((s) => (
              <Chip key={s} label={t(STATUS_KEY[s])} active={entry.status === s} onPress={() => saved({ status: s }, () => setStatus(story.id, userId, s), s === 'finished' && entry.status !== 'finished' ? () => router.push(`/finished/${story.id}`) : undefined)} />
            ))}
          </View>

          <T v="label">{progressLine(libraryEntry, t)}</T>

          {next ? (
            <Button
              title={next.newlyPublished ? t('story.chapterOut', { n: next.chapter }) : t('story.finishChapter', { n: next.chapter })}
              onPress={() => saved({ progress_section: next.chapter }, () => finishChapter(story.id, userId, next))}
             
            />
          ) : null}

          {story.has_chapters ? (
            <>
              <Button variant="secondary" title={t('story.changeChapter')} onPress={() => setPicking((p) => !p)} />
              {picking ? (
                <View accessibilityLabel={t('story.chapterPicker')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
                  {Array.from({ length: (count ?? entry.progress_section) + 1 }, (_, n) => (
                    <Pressable
                      key={n}
                      testID={`chapter-option-${n}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: entry.progress_section === n }}
                      accessibilityLabel={n === 0 ? t('library.notStarted') : t('story.chapterOption', { n })}
                     
                      onPress={() => {
                        setPicking(false);
                        saved({ progress_section: n }, () => setChapter(story.id, userId, n));
                      }}
                      style={{
                        minWidth: 44,
                        minHeight: 44,
                        paddingHorizontal: 12,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: radius.pill,
                        backgroundColor: entry.progress_section === n ? c.primary : c.surface,
                        ...(entry.progress_section === n ? {} : softShadow(isDark, 'small')),
                      }}
                    >
                      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: entry.progress_section === n ? c.onPrimary : c.inkSoft }}>{n}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </>
          ) : null}

          {!isFic ? (
            <View style={{ gap: space.s }}>
              <Field
                label={t('story.page')}
                value={pageText}
                onChangeText={setPageText}
                keyboardType="number-pad"
                placeholder={story.page_count ? `1–${story.page_count}` : undefined}
              />
              <Button variant="secondary" title={t('story.savePage')} onPress={savePage} />
              {percent !== null ? <T v="label">{t('story.percentRead', { n: percent })}</T> : null}
            </View>
          ) : null}

          {canComplete(story, entry.progress_section) ? (
            <Button variant="secondary" title={t('story.markComplete')} onPress={() => act(() => markComplete(story.id))} />
          ) : null}
          {canReopen(story, entry.progress_section) ? (
            <Button variant="link" title={t('story.reopen')} onPress={() => act(() => reopen(story.id))} />
          ) : null}
        </Card>
      ) : (
        <Button title={t('story.addToLibrary')} onPress={() => act(() => addToLibrary(story.id, "want_to_read"))} loading={busy} />
      )}
    </>
  );
}
