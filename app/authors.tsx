import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, ErrorText, Field, T } from '@/components/ui';
import { useT } from '@/i18n';
import { requestRemoval } from '@/lib/safety';
import { normaliseAo3Link } from '@/lib/sources';
import { space, useTheme } from '@/theme';

export default function Authors() {
  const { c, fonts } = useTheme();
  const t = useT();
  const router = useRouter();
  const [storyUrl, setStoryUrl] = useState('');
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<'link' | 'contact' | 'send' | null>(null);
  const [sent, setSent] = useState(false);

  const send = async () => {
    setSent(false);
    if (!normaliseAo3Link(storyUrl)) {
      setProblem('link');
      return;
    }
    if (contact.trim().length < 3) {
      setProblem('contact');
      return;
    }
    setProblem(null);
    setSending(true);
    try {
      await requestRemoval({ storyUrl, contact, message });
      setStoryUrl('');
      setContact('');
      setMessage('');
      setSent(true);
    } catch {
      setProblem('send');
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.ground }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.l }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'flex-start' }}>
            <Button variant="link" title={t('safety.back')} onPress={() => router.back()} />
          </View>
          <T v="h1">{t('safety.authorsTitle')}</T>
          <T v="moment">{t('safety.authorsQuote')}</T>
          <View style={{ gap: space.s }}>
            <T>{t('safety.authorsBody1')}</T>
            <T>{t('safety.authorsBody2')}</T>
            <T>{t('safety.authorsBody3')}</T>
          </View>
          <Card tone="mine">
            <T v="h2">{t('safety.removalTitle')}</T>
            <Field label={t('safety.removalLink')} value={storyUrl} onChangeText={setStoryUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
            <Field label={t('safety.removalContact')} value={contact} onChangeText={setContact} autoCapitalize="none" />
            <Field label={t('safety.removalMessage')} value={message} onChangeText={setMessage} multiline />
            <ErrorText>{problem === 'link' ? t('safety.removalBadLink') : problem === 'contact' ? t('safety.removalNeedsContact') : problem === 'send' ? t('safety.error') : null}</ErrorText>
            {sent ? (
              <Text accessibilityLiveRegion="polite" style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.success }}>
                {t('safety.removalSent')}
              </Text>
            ) : null}
            <Button title={t('safety.removalButton')} onPress={() => void send()} loading={sending} />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
