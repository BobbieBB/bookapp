import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StoryRow } from '@/components/StoryRow';
import { Card, ErrorText, text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useMyLibrary } from '@/lib/library';
import { STATUS_LABEL, type LibraryStatus, type StoryKind } from '@/lib/types';
import { colors, space } from '@/theme';

const FILTERS: (LibraryStatus | 'all')[] = ['all', 'currently_reading', 'want_to_read', 'finished', 'on_hold', 'dnf'];

export default function Library() {
  const { session, profile } = useAuth();
  const [kind, setKind] = useState<StoryKind>(profile?.reads_books === false ? 'fanfic' : 'book');
  const [filter, setFilter] = useState<LibraryStatus | 'all'>('all');
  const { entries, loading, error } = useMyLibrary(session?.user.id);

  // Books and fanfiction are always shown in separate sections (fandom etiquette).
  const shown = entries.filter(
    (e) => e.story.kind === kind && (filter === 'all' || e.status === filter),
  );
  const filters = FILTERS.filter((f) => kind === 'fanfic' || f !== 'on_hold');

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.ground }}>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.l }}>
        <Text style={text.h1}>My Library</Text>

        <View style={{ flexDirection: 'row', gap: space.s }}>
          <Chip label="Books" active={kind === 'book'} onPress={() => setKind('book')} big />
          <Chip label="Fanfiction" active={kind === 'fanfic'} onPress={() => setKind('fanfic')} big />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s }}>
          {filters.map((f) => (
            <Chip
              key={f}
              label={f === 'all' ? 'All' : STATUS_LABEL[f]}
              active={filter === f}
              onPress={() => setFilter(f)}
            />
          ))}
        </ScrollView>

        {loading ? (
          <ActivityIndicator color={colors.accent} />
        ) : shown.length ? (
          shown.map((e) => <StoryRow key={e.story_id} entry={e} showStatus={filter === 'all'} />)
        ) : (
          <Card>
            <Text style={text.h2}>{kind === 'book' ? 'No books here yet' : 'No fics here yet'}</Text>
            <Text style={text.muted}>Adding stories arrives in the next update.</Text>
          </Card>
        )}
        <ErrorText>{error}</ErrorText>
      </ScrollView>
    </SafeAreaView>
  );
}

function Chip({ label, active, onPress, big }: { label: string; active: boolean; onPress: () => void; big?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        minHeight: 44,
        paddingHorizontal: big ? 18 : 14,
        borderRadius: 999,
        justifyContent: 'center',
        borderWidth: active ? 2 : 1,
        borderColor: active ? colors.accent : colors.line,
        backgroundColor: active ? colors.accentSoft : colors.surface,
      }}
    >
      <Text style={{ fontSize: big ? 16 : 14, fontWeight: active ? '700' : '400', color: active ? colors.accentDark : colors.inkSoft }}>
        {label}
      </Text>
    </Pressable>
  );
}
