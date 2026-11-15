import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Chip, ErrorText, Field, T } from '@/components/ui';
import { useT } from '@/i18n';
import { useHeaderOffset } from '@/lib/headerOffset';
import { track } from '@/lib/analytics';
import { sendFeedback, type FeedbackKind } from '@/lib/safety';
import { space, useTheme } from '@/theme';

const KINDS: readonly FeedbackKind[] = ['problem', 'idea', 'other'];

export default function Feedback() {
  const { c, fonts } = useTheme();
  const t = useT();
  const headerOffset = useHeaderOffset();
  const [kind, setKind] = useState<FeedbackKind>('problem');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sent, setSent] = useState(false);

  const send = async () => {
    setSending(true);
    setFailed(false);
    setSent(false);
    try {
      await sendFeedback(kind, body);
      void track('feedback_sent', { kind });
      setBody('');
      setSent(true);
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: c.ground }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerOffset}>
        <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.l }} keyboardShouldPersistTaps="handled">
          <T v="h1">{t('safety.feedbackHeading')}</T>
          <T v="muted">{t('safety.feedbackIntro')}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
            {KINDS.map((k) => (
              <Chip key={k} label={t(`safety.kind.${k}`)} active={kind === k} onPress={() => setKind(k)} />
            ))}
          </View>
          <Field
            label={t('safety.feedbackLabel')}
            value={body}
            onChangeText={(v) => {
              setBody(v);
              // The thank-you belongs to the message just sent, not to the next one being written.
              setSent(false);
            }}
            multiline
          />
          <ErrorText>{failed ? t('safety.error') : null}</ErrorText>
          {sent ? (
            <Text accessibilityLiveRegion="polite" style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.success }}>
              {t('safety.feedbackSent')}
            </Text>
          ) : null}
          <Button title={t('safety.sendFeedback')} onPress={() => void send()} disabled={!body.trim()} loading={sending} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
