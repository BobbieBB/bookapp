import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StoryRow } from '@/components/StoryRow';
import { Card, ErrorText, text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { APP_NAME } from '@/lib/config';
import { useMyLibrary } from '@/lib/library';
import { colors, space } from '@/theme';

export default function Home() {
  const { session, profile } = useAuth();
  const { entries, loading, error } = useMyLibrary(session?.user.id, 'currently_reading');
  const name = profile?.username;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.ground }}>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.l }}>
        <Text style={[text.overline, { color: colors.accent }]}>{APP_NAME.toUpperCase()}</Text>
        <View style={{ gap: space.xs }}>
          <Text style={text.h1}>Hi, {name}</Text>
          <Text style={text.body}>Pick up where you left off.</Text>
        </View>

        <Text style={text.overline}>CONTINUE READING</Text>
        {loading ? (
          <ActivityIndicator color={colors.accent} />
        ) : entries.length ? (
          entries.map((e) => <StoryRow key={e.story_id} entry={e} />)
        ) : (
          <Card>
            <Text style={text.h2}>Nothing on the go yet</Text>
            <Text style={text.muted}>
              Adding books and fics comes in the next update. Then the chapters you finish will unlock their
              discussions here.
            </Text>
          </Card>
        )}
        <ErrorText>{error}</ErrorText>

        <Text style={text.overline}>ACTIVE DISCUSSIONS</Text>
        <Card>
          <Text style={text.muted}>Discussions you join will show up here, so you can find your way back.</Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
