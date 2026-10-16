import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddButton } from '@/components/AddButton';
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
  const { entries, loading, error } = useMyLibrary(session?.user.id, 'currently_reading');
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
                <StoryRow key={e.story_id} entry={e} hint={hintFor(e.story_id)} />
              ))}
            </View>
          ))
        ) : (
          <Card>
            <T v="h2">{t('home.emptyTitle')}</T>
            <T v="muted">{t('home.emptyHint')}</T>
          </Card>
        )}
        <ErrorText>{error}</ErrorText>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T v="overline">{t('home.repliesTitle')}</T>
          <Button variant="link" title={t('notifications.seeAll')} onPress={() => router.push('/notifications')} />
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
