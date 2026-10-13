import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { space, useTheme } from '@/theme';

export default function Profile() {
  const { c } = useTheme();
  const { profile, session, signOut } = useAuth();
  const reads = [profile?.reads_books && 'Books', profile?.reads_fanfic && 'Fanfiction'].filter(Boolean).join(' & ');

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.ground }}>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.l }}>
        <View style={{ gap: space.xs }}>
          <T v="h1">{profile?.username}</T>
          <T v="muted">{session?.user.email}</T>
          <T>Reads: {reads}</T>
        </View>

        <Card tone="mine">
          <T v="moment" style={{ fontSize: 26 }}>Authors are welcome here</T>
          <T v="muted">
            Every fic is a gift to the community. We only keep a link to your work and send readers back to you for
            kudos and comments. If you wrote a fic and would rather it wasn’t listed here, you can ask us to hide it
            at any time.
          </T>
        </Card>

        <Button variant="secondary" title="Sign out" onPress={signOut} />
      </ScrollView>
    </SafeAreaView>
  );
}
