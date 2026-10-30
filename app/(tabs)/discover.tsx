import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useRouter } from 'expo-router';

import { Button, Card, Chip, ErrorText, Field, T } from '@/components/ui';
import { useT } from '@/i18n';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { lively, myFandoms, searchFandoms, type LivelyStory, type LivelyTier } from '@/lib/discover';
import { useLookup } from '@/lib/useLookup';
import { coverColor, softShadow, space, useTheme } from '@/theme';

const MAX_CHIPS = 6;
const SEARCH_DELAY_MS = 350;

const TIER_KEY = {
  week: 'discover.tier.week',
  month: 'discover.tier.month',
  readers: 'discover.tier.readers',
  starter: 'discover.tier.starter',
} as const satisfies Record<LivelyTier, string>;

function LivelyRow({ story, onOpen }: { story: LivelyStory; onOpen: () => void }) {
  const t = useTheme();
  const tr = useT();
  const cover = coverColor(story.id, t.isDark);
  const subtitle = [story.author_name, story.fandoms[0]].filter(Boolean).join(' · ');
  const tag = story.status === 'completed' ? tr('add.complete') : story.status === 'ongoing' ? tr('add.wip') : null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onOpen}
      style={[t.card, { flexDirection: 'row', alignItems: 'center', gap: 14, padding: space.m }]}
    >
      {/* Typographic cover: fics never have covers. Decorative: the title is read from the row. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 64,
          height: 92,
          borderRadius: 10,
          backgroundColor: cover.bg,
          ...softShadow(t.isDark, 'small'),
          justifyContent: 'space-between',
          padding: 6,
        }}
      >
        <Text numberOfLines={4} style={{ fontFamily: t.fonts.moment, fontSize: 15, lineHeight: 15, color: cover.fg }}>
          {story.title}
        </Text>
        <Text numberOfLines={2} style={{ fontFamily: t.fonts.bodyBold, fontSize: 8, lineHeight: 9, letterSpacing: 0.2, color: cover.fg }}>
          {story.author_name.toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <T v="h2" numberOfLines={2}>
          {story.title}
        </T>
        <T v="muted" numberOfLines={2}>
          {subtitle}
        </T>
        {tag && <T v="label">{tag}</T>}
      </View>
    </Pressable>
  );
}

function FandomSearch({ onPick }: { onPick: (fandom: string) => void }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const trimmed = query.trim();
  // Like book search: from 3 characters, after a pause in typing.
  const { loading, data, error } = useLookup(trimmed.length >= 3 ? trimmed : null, () => searchFandoms(trimmed), SEARCH_DELAY_MS);
  return (
    <View style={{ gap: space.s }}>
      <Field label={t('discover.searchLabel')} value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} autoFocus />
      {trimmed !== '' && loading && <T v="muted">{t('discover.searching')}</T>}
      {error !== undefined && <ErrorText>{t('discover.error')}</ErrorText>}
      {data?.length === 0 && (
        // Cold start: Livami only knows fandoms of fics readers have added, so invite them to add one.
        <Card style={{ gap: space.s }}>
          <T v="muted">{t('discover.noHits')}</T>
          <Button variant="secondary" title={t('discover.addFic')} onPress={() => router.push({ pathname: '/add', params: { kind: 'fanfic' } })} />
        </Card>
      )}
      {data?.map((hit) => (
        <Pressable
          key={hit.fandom}
          testID={`fandom-hit-${hit.fandom}`}
          accessibilityRole="button"
          onPress={() => onPick(hit.fandom)}
          style={{ minHeight: 44, justifyContent: 'center', paddingVertical: space.xs }}
        >
          <T v="label">{hit.fandom}</T>
          <T v="muted">{t('discover.hitStories', { count: hit.stories })}</T>
        </Pressable>
      ))}
    </View>
  );
}

export default function Discover() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const { profile } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  // Tabs stay mounted: reload whenever Discover comes back into view (fandoms or library may have changed).
  const [version, setVersion] = useState(0);
  // The tier of the first loaded list is remembered so later focuses can report it; the first has none.
  const firstTier = useRef<LivelyTier | null>(null);
  useFocusEffect(
    useCallback(() => {
      setVersion((v) => v + 1);
      void track('discover_opened', firstTier.current ? { tier: firstTier.current } : {});
    }, []),
  );
  const mine = useLookup(`mine-${version}`, () => myFandoms());
  // The profile default is reads_fanfic = false, so a reader who has picked a fandom or shelved a fic
  // is a fanfiction reader whatever the flag says; only a reader with neither is told it is not for them.
  const fanficReader = profile?.reads_fanfic !== false || (mine.data ?? []).some((f) => f.source !== 'starter');
  const chips = (mine.data ?? []).slice(0, MAX_CHIPS).map((f) => f.fandom);
  const shownChips = selected && !chips.includes(selected) ? [selected, ...chips.slice(0, MAX_CHIPS - 1)] : chips;
  const scope = selected ? [selected] : chips;
  const feed = useLookup(mine.data ? `${version}:${JSON.stringify(scope)}` : null, () => lively(scope));
  const loadedTier = feed.data?.[0]?.tier;
  useEffect(() => {
    if (loadedTier && !firstTier.current) firstTier.current = loadedTier;
  }, [loadedTier]);

  function pick(fandom: string) {
    setSelected(fandom);
    setSearching(false);
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.ground }}>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.l }}>
        {mine.error !== undefined ? (
          <ErrorText>{t('discover.error')}</ErrorText>
        ) : !mine.data ? (
          <ActivityIndicator color={c.primary} accessibilityLabel={t('discover.loading')} />
        ) : !fanficReader ? (
          <Card>
            <T v="h2">{t('discover.fanficOnly')}</T>
          </Card>
        ) : (
          <>
            <View style={{ gap: space.s }}>
              <T v="overline">{t('discover.yourFandoms')}</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
                {shownChips.map((fandom) => (
                  <Chip
                    key={fandom}
                    label={fandom}
                    active={selected === fandom}
                    onPress={() => {
                      // One choice at a time: picking a fandom closes the search.
                      setSelected(selected === fandom ? null : fandom);
                      setSearching(false);
                    }}
                  />
                ))}
                <Chip
                  label={t('discover.allFandoms')}
                  active={searching}
                  onPress={() => {
                    setSearching(!searching);
                    setSelected(null);
                  }}
                />
              </View>
              {searching && <FandomSearch onPick={pick} />}
            </View>

            <View style={{ gap: space.s }}>
              <T v="overline">{selected ? t('discover.livelyIn', { fandom: selected.toUpperCase() }) : t('discover.lively')}</T>
              {feed.error !== undefined ? (
                <ErrorText>{t('discover.error')}</ErrorText>
              ) : !feed.data ? (
                <ActivityIndicator color={c.primary} accessibilityLabel={t('discover.loading')} />
              ) : feed.data.length === 0 ? (
                <Card style={{ gap: space.s }}>
                  <T v="muted">{t('discover.empty')}</T>
                  <Button variant="secondary" title={t('discover.addFic')} onPress={() => router.push({ pathname: '/add', params: { kind: 'fanfic' } })} />
                </Card>
              ) : (
                <>
                  <T v="muted">{t(TIER_KEY[feed.data[0].tier])}</T>
                  {feed.data.map((story) => (
                    <LivelyRow key={story.id} story={story} onOpen={() => router.push(`/story/${story.id}`)} />
                  ))}
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
