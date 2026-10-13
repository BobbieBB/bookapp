import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, ErrorText, Field, Toggle, text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { colors, space } from '@/theme';

export default function Onboarding() {
  const { session, refreshProfile, signOut } = useAuth();
  const [username, setUsername] = useState('');
  const [readsBooks, setReadsBooks] = useState(true);
  const [readsFanfic, setReadsFanfic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setError('');
    const handle = username.trim();
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(handle)) {
      return setError('Names use 3–30 letters, numbers or underscores, no spaces.');
    }
    if (!readsBooks && !readsFanfic) return setError('Pick at least one: books or fanfiction.');

    setBusy(true);
    const { error } = await supabase.from('profiles').insert({
      id: session!.user.id,
      username: handle,
      // One name per reader (decided 13 Oct 2026). display_name stays in the
      // database, unused, in case we ever allow names with spaces.
      display_name: null,
      reads_books: readsBooks,
      reads_fanfic: readsFanfic,
    });
    setBusy(false);
    if (error) {
      if (error.code === '23505' && /profiles_pkey/.test(error.message)) {
        // The profile already exists (e.g. created on another device): just load it.
        await refreshProfile();
        return;
      }
      setError(error.code === '23505' ? 'That username is taken. Try another one.' : error.message);
      return;
    }
    await refreshProfile();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.l }}>
          <View style={{ gap: space.s }}>
            <Text style={text.h1}>Make yourself at home</Text>
            <Text style={text.body}>Pick a name other readers will see in discussions.</Text>
          </View>

          <Field
            label="Name"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="e.g. nightowl_reads"
          />
          <Text style={[text.muted, { marginTop: -space.s }]}>
            Unique to you. Letters, numbers and _ only.
          </Text>

          <Card>
            <Text style={text.h2}>What do you read?</Text>
            <Toggle label="Books" value={readsBooks} onChange={setReadsBooks} />
            <Toggle label="Fanfiction" value={readsFanfic} onChange={setReadsFanfic} />
            <Text style={text.muted}>Books and fics live in separate sections. You can change this later.</Text>
          </Card>

          <Card>
            <Text style={[text.h2, { color: colors.accentDark }]}>Every fic is a gift. Cherish it. Protect it.</Text>
            <Text style={text.muted}>
              We never host or sell fanfiction. We link back to the author, and remind you to leave kudos and
              comments where they posted it.
            </Text>
          </Card>

          <ErrorText>{error}</ErrorText>
          <Button title="Start reading" onPress={save} loading={busy} />
          <Button variant="link" title="Sign out" onPress={signOut} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
