import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddButton } from '@/components/AddButton';
import { useMyCoverUrls } from '@/components/CustomCover';
import { StoryRow } from '@/components/StoryRow';
import { NotificationRow } from '@/components/NotificationRow';
import { Button, Card, ErrorText, T } from '@/components/ui';
import { useLanguage, useT, type Language } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { useMyLibrary } from '@/lib/library';
import { continueReadingHints, repliesToYou } from '@/lib/notifications';
import { useLookup } from '@/lib/useLookup';
import { space, useTheme } from '@/theme';

export default function Home() {
  const { c } = useTheme();
  const t = useT();
  const { language } = useLanguage();
  const { session, profile } = useAuth();
  // The whole library, so Home can tell "nothing added yet" from "nothing being read right now".
  const { entries: library, loading, error } = useMyLibrary(session?.user.id);
  // A caught-up WIP comes back to Home when someone reports a new chapter ("Chapter 17 is out").
  const newChapterOut = (e: (typeof library)[number]) =>
    e.status === 'finished' && e.story.kind === 'fanfic' && e.story.status === 'ongoing' && (e.story.published_sections ?? 0) > e.progress_section;
  const entries = library.filter((e) => e.status === 'currently_reading' || newChapterOut(e));
  // Keyed by the whole library (a stable list), not the filtered one, which is new on every render.
  const coverUrls = useMyCoverUrls(library);
  const router = useRouter();
  const [version, setVersion] = useState(0);
  useFocusEffect(useCallback(() => setVersion((v) => v + 1), []));
  const userId = session?.user.id;
  const replies = useLookup(userId ? `replies-${userId}-${version}` : null, () => repliesToYou(3));
  const hints = useLookup(userId ? `hints-${userId}-${version}` : null, continueReadingHints);
  const replyItems = replies.data ?? replies.previous;
  const hintMap = hints.data ?? hints.previous;
  // Fanfiction and books are never mixed in one list (fandom etiquette), and Home shows only
  // what the reader said they read. Everything stays reachable in My Library.
  const groups = (['fanfic', 'book'] as const)
    .filter((kind) => (kind === 'book' ? profile?.reads_books : profile?.reads_fanfic) !== false)
    .map((kind) => ({ kind, items: entries.filter((e) => e.story.kind === kind) }))
    .filter((g) => g.items.length);

  const hintFor = (storyId: string) => {
    const e = entries.find((x) => x.story_id === storyId);
    if (e && newChapterOut(e)) return t('home.newChapter', { n: e.progress_section + 1 });
    const h = hintMap?.get(storyId);
    return h && h.new_comments > 0 ? t('notifications.newComments', { count: h.new_comments, chapter: h.section_number }) : undefined;
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.ground }}>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.l }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ gap: space.xs, flex: 1 }}>
            <T v="overline">{greeting(language, t)}</T>
            <T v="h1">{t('home.hi', { name: profile?.username ?? '' })}</T>
          </View>
          <AddButton />
        </View>

        {loading ? (
          <ActivityIndicator color={c.primary} />
        ) : groups.length ? (
          groups.map(({ kind, items }) => (
            <View key={kind} style={{ gap: space.m }}>
              <T v="overline">{kind === 'fanfic' ? t('home.continueFanfic') : t('home.continueBooks')}</T>
              {items.map((e) => (
                <StoryRow key={e.story_id} entry={e} hint={hintFor(e.story_id)} coverUrl={coverUrls[e.story_id]} />
              ))}
            </View>
          ))
        ) : (
          <Card>
            <T v="h2">{library.length ? t('home.idleTitle') : t('home.emptyTitle')}</T>
            <T v="muted">{library.length ? t('home.idleHint') : t('home.emptyHint')}</T>
            {library.length ? <Button variant="link" title={t('home.toLibrary')} onPress={() => router.navigate('/library')} /> : null}
          </Card>
        )}
        <ErrorText>{error}</ErrorText>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T v="overline">{t('home.repliesTitle')}</T>
          {replyItems?.length ? (
            <Button variant="link" title={t('notifications.seeAll')} onPress={() => router.push('/notifications')} />
          ) : null}
        </View>
        {replyItems?.length ? (
          replyItems.map((n) => <NotificationRow key={n.id} n={n} />)
        ) : (
          <Card tone="band">
            <T v="muted">{t('home.repliesEmpty')}</T>
          </Card>
        )}
        <ErrorText>{replies.error !== undefined ? t('notifications.error') : null}</ErrorText>
      </ScrollView>
    </SafeAreaView>
  );
}

function greeting(language: Language, t: ReturnType<typeof useT>) {
  const day = new Date().toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-GB', { weekday: 'long' }).toUpperCase();
  const h = new Date().getHours();
  const key = h < 5 ? 'home.greetingNight' : h < 12 ? 'home.greetingMorning' : h < 18 ? 'home.greetingAfternoon' : 'home.greetingNight';
  return t(key, { day });
}
