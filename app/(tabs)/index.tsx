import { ActivityIndicator, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StoryRow } from '@/components/StoryRow';
import { Card, ErrorText, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useMyLibrary } from '@/lib/library';
import { space, useTheme } from '@/theme';

export default function Home() {
  const { c } = useTheme();
  const { session, profile } = useAuth();
  const { entries, loading, error } = useMyLibrary(session?.user.id, 'currently_reading');

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.ground }}>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.l }}>
        <View style={{ gap: space.xs }}>
          <T v="overline">{greeting()}</T>
          <T v="h1">Hi, {profile?.username}</T>
        </View>

        {loading ? (
          <ActivityIndicator color={c.primary} />
        ) : entries.length ? (
          // Fanfiction and books are never mixed in one list (fandom etiquette).
          (['fanfic', 'book'] as const).map((kind) => {
            const group = entries.filter((e) => e.story.kind === kind);
            if (!group.length) return null;
            return (
              <View key={kind} style={{ gap: space.m }}>
                <T v="overline">CONTINUE READING · {kind === 'fanfic' ? 'FANFICTION' : 'BOOKS'}</T>
                {group.map((e) => (
                  <StoryRow key={e.story_id} entry={e} />
                ))}
              </View>
            );
          })
        ) : (
          <Card>
            <T v="h2">Nothing on the go yet</T>
            <T v="muted">
              Adding books and fics comes in the next update. Then the chapters you finish will unlock their
              discussions here.
            </T>
          </Card>
        )}
        <ErrorText>{error}</ErrorText>

        <T v="overline">REPLIES TO YOU</T>
        <Card tone="band">
          <T v="muted">When someone replies to you or mentions you, you'll see it here.</T>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function greeting() {
  const day = new Date().toLocaleDateString('en-GB', { weekday: 'long' }).toUpperCase();
  const h = new Date().getHours();
  const part = h < 5 ? 'NIGHT' : h < 12 ? 'MORNING' : h < 18 ? 'AFTERNOON' : 'NIGHT';
  return `${day} ${part} READING`;
}
