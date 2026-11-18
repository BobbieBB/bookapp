import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useRouter } from 'expo-router';

import { Button, Card, Chip, ErrorText, Field, T } from '@/components/ui';
import { useT } from '@/i18n';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { useCompleteOnly } from '@/lib/completeOnly';
import {
  ficsWithShip,
  lively,
  myFandoms,
  searchFandoms,
  searchShips,
  searchStories,
  type LivelyStory,
  type LivelyTier,
  type StoryHit,
} from '@/lib/discover';
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
  const cover = coverColor(story.id, t.mode);
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
          ...softShadow(t.mode, 'small'),
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

/** One story found by title or author: what it is, who wrote it, and how many read it here. */
function StoryHitRow({ hit, onOpen }: { hit: StoryHit; onOpen: () => void }) {
  const tr = useT();
  const kind = hit.kind === 'book' ? tr('discover.kindBook') : tr('discover.kindFic');
  const where = hit.kind === 'fanfic' ? hit.fandoms[0] : hit.language ? hit.language.toUpperCase() : null;
  const subtitle = [kind, hit.author_name, where].filter(Boolean).join(' · ');
  return (
    <Pressable
      testID={`story-hit-${hit.id}`}
      accessibilityRole="button"
      onPress={onOpen}
      style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', paddingVertical: space.xs, opacity: pressed ? 0.6 : 1 })}
    >
      <T v="label" numberOfLines={2}>
        {hit.title}
      </T>
      <T v="muted" numberOfLines={1}>
        {subtitle}
      </T>
      {hit.readers > 0 && <T v="muted">{tr('discover.readers', { count: hit.readers })}</T>}
    </Pressable>
  );
}

/**
 * Search Livami by title or author (PO, 16 Nov 2026): only stories readers have already added, books and
 * fics, never AO3 or Open Library. From 3 letters, after a pause in typing, like every search.
 */
function StorySearchResults({ query }: { query: string }) {
  const t = useT();
  const trimmed = query.trim();
  const { data, error, previous } = useLookup(`stories:${trimmed}`, () => searchStories(trimmed), SEARCH_DELAY_MS);
  // While the next answer loads, the last results stay on screen, so the list doesn't flicker per keystroke.
  const shown = data ?? previous;
  const addButtons = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
      <Button variant="secondary" title={t('discover.addBook')} onPress={() => router.push({ pathname: '/add', params: { kind: 'book' } })} />
      <Button variant="secondary" title={t('discover.addFic')} onPress={() => router.push({ pathname: '/add', params: { kind: 'fanfic' } })} />
    </View>
  );
  if (error !== undefined) return <ErrorText>{t('discover.error')}</ErrorText>;
  if (!shown) return <T v="muted">{t('discover.searching')}</T>;
  if (shown.length === 0) {
    return (
      <Card style={{ gap: space.s }}>
        <T v="muted">{t('discover.storyNoHits')}</T>
        {addButtons}
      </Card>
    );
  }
  return (
    <View style={{ gap: space.s }}>
      {shown.map((hit) => (
        <StoryHitRow key={hit.id} hit={hit} onOpen={() => router.push(`/story/${hit.id}`)} />
      ))}
      {/* Like book search: adding by hand is offered after the reader has looked through the results. */}
      <View style={{ gap: space.s, paddingTop: space.s }}>
        <T v="muted">{t('discover.storyNotHere')}</T>
        {addButtons}
      </View>
    </View>
  );
}

/** Fandoms and ships (by the characters' names or a nickname such as "dramione"), from 3 letters. */
function FandomSearch({ onPick, onPickShip }: { onPick: (fandom: string) => void; onPickShip: (ship: string) => void }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const trimmed = query.trim();
  // Like book search: from 3 characters, after a pause in typing.
  const { loading, data, error } = useLookup(
    trimmed.length >= 3 ? trimmed : null,
    async () => {
      const [fandoms, ships] = await Promise.all([searchFandoms(trimmed), searchShips(trimmed)]);
      return { fandoms, ships };
    },
    SEARCH_DELAY_MS,
  );
  const nothing = data && data.fandoms.length === 0 && data.ships.length === 0;
  return (
    <View style={{ gap: space.s }}>
      <Field label={t('discover.searchLabel')} value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} autoFocus />
      {trimmed !== '' && loading && <T v="muted">{t('discover.searching')}</T>}
      {error !== undefined && <ErrorText>{t('discover.error')}</ErrorText>}
      {nothing && (
        // Cold start: Livami only knows fandoms and ships of fics readers have added, so invite them to add one.
        <Card style={{ gap: space.s }}>
          <T v="muted">{t('discover.noHits')}</T>
          <Button variant="secondary" title={t('discover.addFic')} onPress={() => router.push({ pathname: '/add', params: { kind: 'fanfic' } })} />
        </Card>
      )}
      {data && data.fandoms.length > 0 && data.ships.length > 0 && <T v="overline">{t('discover.fandomsHeading')}</T>}
      {data?.fandoms.map((hit) => (
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
      {data && data.ships.length > 0 && <T v="overline">{t('discover.shipsHeading')}</T>}
      {data?.ships.map((hit) => (
        <Pressable
          key={hit.ship}
          testID={`ship-hit-${hit.ship}`}
          accessibilityRole="button"
          onPress={() => onPickShip(hit.ship)}
          style={{ minHeight: 44, justifyContent: 'center', paddingVertical: space.xs }}
        >
          <T v="label">{hit.ship}</T>
          <T v="muted">
            {[hit.nickname ? hit.nickname.replace(/^./, (c) => c.toUpperCase()) : null, t('discover.hitStories', { count: hit.stories })]
              .filter(Boolean)
              .join(' · ')}
          </T>
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
  // A ship picked in the search: the list shows fics with that ship instead of the fandoms'.
  const [ship, setShip] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  // Search Livami by title or author: while there is text, the results take the place of the rest.
  const [storyQuery, setStoryQuery] = useState('');
  // From 3 letters the results take the place of the rest of Discover. With fewer, Discover stays as it is;
  // "Type at least 3 letters" shows only if the reader presses Search (docs/DECISIONS.md, "Search-as-you-type").
  const searchingStories = storyQuery.trim().length >= 3;
  const [tooShort, setTooShort] = useState(false);
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
  // Say where the chips come from, so Discover and Profile tell the same story: only fandoms the reader
  // picked are "yours"; before that they come from the library, or are popular ones to start with.
  const sources = new Set((mine.data ?? []).slice(0, MAX_CHIPS).map((f) => f.source));
  const chipsTitle = sources.has('picked') ? 'discover.yourFandoms' : sources.has('library') ? 'discover.fromLibrary' : 'discover.popularFandoms';
  const shownChips = selected && !chips.includes(selected) ? [selected, ...chips.slice(0, MAX_CHIPS - 1)] : chips;
  const scope = selected ? [selected] : chips;
  const [completeOnly, setCompleteOnly] = useCompleteOnly();
  const feed = useLookup(
    mine.data && completeOnly !== null ? `${version}:${completeOnly}:${ship ?? ''}:${JSON.stringify(scope)}` : null,
    () => (ship ? ficsWithShip(ship, completeOnly === true) : lively(scope, completeOnly === true)),
  );
  const loadedTier = feed.data?.[0]?.tier;
  useEffect(() => {
    if (loadedTier && !firstTier.current) firstTier.current = loadedTier;
  }, [loadedTier]);

  function pick(fandom: string) {
    setSelected(fandom);
    setShip(null);
    setSearching(false);
  }

  function pickShip(picked: string) {
    setShip(picked);
    setSelected(null);
    setSearching(false);
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.ground }}>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.l }} keyboardShouldPersistTaps="handled">
        {/* For every reader, books too: the rest of Discover is fanfiction only for now. */}
        <Field
          label={t('discover.storySearchLabel')}
          placeholder={t('discover.storySearchPlaceholder')}
          value={storyQuery}
          onChangeText={(text) => {
            setStoryQuery(text);
            setTooShort(false);
          }}
          onSubmitEditing={() => setTooShort(storyQuery.trim().length > 0 && !searchingStories)}
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          maxLength={200}
        />
        {tooShort && <T v="muted">{t('discover.storySearchShort')}</T>}
        {searchingStories ? (
          <StorySearchResults query={storyQuery} />
        ) : mine.error !== undefined ? (
          <ErrorText>{t('discover.error')}</ErrorText>
        ) : !mine.data ? (
          <ActivityIndicator color={c.signal} accessibilityLabel={t('discover.loading')} />
        ) : !fanficReader ? (
          <Card>
            <T v="h2">{t('discover.fanficOnly')}</T>
          </Card>
        ) : (
          <>
            <View style={{ gap: space.s }}>
              <T v="overline">{t(chipsTitle)}</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
                {shownChips.map((fandom) => (
                  <Chip
                    key={fandom}
                    label={fandom}
                    active={selected === fandom}
                    onPress={() => {
                      // One choice at a time: picking a fandom closes the search.
                      setSelected(selected === fandom ? null : fandom);
                      setShip(null);
                      setSearching(false);
                    }}
                  />
                ))}
                {ship ? <Chip label={ship} active onPress={() => setShip(null)} /> : null}
                <Chip
                  label={t('discover.allFandoms')}
                  active={searching}
                  onPress={() => {
                    setSearching(!searching);
                    setSelected(null);
                    setShip(null);
                  }}
                />
              </View>
              {searching && <FandomSearch onPick={pick} onPickShip={pickShip} />}
            </View>

            <View style={{ gap: space.s }}>
              <T v="overline">
                {ship
                  ? t('discover.withShip', { ship: ship.toUpperCase() })
                  : selected
                    ? t('discover.livelyIn', { fandom: selected.toUpperCase() })
                    : t('discover.lively')}
              </T>
              <View style={{ flexDirection: 'row' }}>
                <Chip label={t('discover.completeOnly')} active={completeOnly === true} onPress={() => setCompleteOnly(!completeOnly)} />
              </View>
              {feed.error !== undefined ? (
                <ErrorText>{t('discover.error')}</ErrorText>
              ) : !feed.data ? (
                <ActivityIndicator color={c.signal} accessibilityLabel={t('discover.loading')} />
              ) : feed.data.length === 0 && completeOnly ? (
                // Even the starter fandoms have no complete fic you don't read yet: the filter is what empties the list.
                <Card>
                  <T v="muted">{t('discover.completeOnlyEmpty')}</T>
                </Card>
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
