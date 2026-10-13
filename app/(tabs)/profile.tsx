import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors, space } from '@/theme';

export default function Profile() {
  const { profile, session, signOut } = useAuth();
  const reads = [profile?.reads_books && 'Books', profile?.reads_fanfic && 'Fanfiction'].filter(Boolean).join(' & ');

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.ground }}>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.l }}>
        <View style={{ gap: space.xs }}>
          <Text style={text.h1}>{profile?.username}</Text>
          <Text style={text.muted}>{session?.user.email}</Text>
          <Text style={text.body}>Reads: {reads}</Text>
        </View>

        <Card>
          <Text style={[text.h2, { color: colors.accentDark }]}>Authors are welcome here</Text>
          <Text style={text.muted}>
            Every fic is a gift to the community. We only keep a link to your work and send readers back to you
            for kudos and comments. If you wrote a fic and would rather it wasn’t listed here, you can ask us to
            hide it at any time.
          </Text>
        </Card>

        <Button variant="secondary" title="Sign out" onPress={signOut} />
      </ScrollView>
    </SafeAreaView>
  );
}
