import { useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddButton } from '@/components/AddButton';
import { StoryRow } from '@/components/StoryRow';
import { Card, Chip, ErrorText, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useMyLibrary } from '@/lib/library';
import { STATUS_LABEL, type LibraryStatus, type StoryKind } from '@/lib/types';
import { space, useTheme } from '@/theme';

const FILTERS: (LibraryStatus | 'all')[] = ['all', 'currently_reading', 'want_to_read', 'finished', 'on_hold', 'dnf'];

export default function Library() {
  const { c } = useTheme();
  const { session, profile } = useAuth();
  const [kind, setKind] = useState<StoryKind>(profile?.reads_books === false ? 'fanfic' : 'book');
  const [filter, setFilter] = useState<LibraryStatus | 'all'>('all');
  const { entries, loading, error } = useMyLibrary(session?.user.id);

  // Books and fanfiction are always shown in separate sections (fandom etiquette).
  const shown = entries.filter((e) => e.story.kind === kind && (filter === 'all' || e.status === filter));
  const filters = FILTERS.filter((f) => kind === 'fanfic' || f !== 'on_hold');

  function switchKind(next: StoryKind) {
    setKind(next);
    // On Hold exists only for fanfiction: don't leave an invisible filter selected.
    if (next === 'book' && filter === 'on_hold') setFilter('all');
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.ground }}>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.l }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T v="h1">My Library</T>
          <AddButton kind={kind} />
        </View>

        <View style={{ flexDirection: 'row', gap: space.s }}>
          <Chip label="Books" active={kind === 'book'} onPress={() => switchKind('book')} big />
          <Chip label="Fanfiction" active={kind === 'fanfic'} onPress={() => switchKind('fanfic')} big />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s }}>
          {filters.map((f) => (
            <Chip key={f} label={f === 'all' ? 'All' : STATUS_LABEL[f]} active={filter === f} onPress={() => setFilter(f)} />
          ))}
        </ScrollView>

        {loading ? (
          <ActivityIndicator color={c.primary} />
        ) : shown.length ? (
          shown.map((e) => <StoryRow key={e.story_id} entry={e} showStatus={filter === 'all'} />)
        ) : (
          <Card>
            <T v="h2">{kind === 'book' ? 'No books here yet' : 'No fics here yet'}</T>
            <T v="muted">Tap + to add one.</T>
          </Card>
        )}
        <ErrorText>{error}</ErrorText>
      </ScrollView>
    </SafeAreaView>
  );
}
