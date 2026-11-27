import { useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Checkbox } from '@/components/TermsConsent';
import { Button, Card, ErrorText, Field, T } from '@/components/ui';
import { useT } from '@/i18n';
import { useHeaderOffset } from '@/lib/headerOffset';
import { requestRemoval } from '@/lib/safety';
import { space, useTheme } from '@/theme';
import { useKeyboardSpace } from '@/lib/keyboard';

export default function Authors() {
  const { c, fonts } = useTheme();
  const t = useT();
  const headerOffset = useHeaderOffset();
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [message, setMessage] = useState('');
  const [allWorks, setAllWorks] = useState(false);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<'missing' | 'send' | null>(null);
  const [sent, setSent] = useState(false);

  const send = async () => {
    setSent(false);
    if (!author.trim() || (!allWorks && !title.trim())) {
      setProblem('missing');
      return;
    }
    setProblem(null);
    setSending(true);
    try {
      await requestRemoval({ title, author, message, allWorks });
      setTitle('');
      setAuthor('');
      setAllWorks(false);
      setMessage('');
      setSent(true);
    } catch {
      setProblem('send');
    } finally {
      setSending(false);
    }
  };

  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const kb = useKeyboardSpace(scroll);
  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: c.ground }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerOffset}>
        <ScrollView ref={scroll} onScroll={kb.onScroll} scrollEventThrottle={16} contentContainerStyle={{ padding: space.xl, paddingBottom: space.xl + kb.bottom, gap: space.l }} keyboardShouldPersistTaps="handled">
          <T v="h1">{t('safety.authorsTitle')}</T>
          <T v="moment">{t('safety.authorsQuote')}</T>
          <View style={{ gap: space.s }}>
            <T>{t('safety.authorsBody1')}</T>
            <T>{t('safety.authorsBody2')}</T>
            <T>{t('safety.authorsBody3')}</T>
          </View>
          <Card tone="mine">
            <T v="h2">{t('safety.removalTitle')}</T>
            {/* Only the title and author name: no AO3 link, no contact details (PO, 23 Nov 2026). */}
            <T v="muted">{t('safety.removalHint')}</T>
            <Field label={t('safety.removalAuthor')} value={author} onChangeText={setAuthor} autoCapitalize="none" autoCorrect={false} />
            {/* One "no" for every work (PO, 27 Nov 2026): the name goes on a list and no fic under it can be added. */}
            <Checkbox label={t('safety.removalAllWorks')} checked={allWorks} onChange={setAllWorks} />
            {allWorks ? (
              <T v="muted">{t('safety.removalAllWorksHint')}</T>
            ) : (
              <Field label={t('safety.removalFicTitle')} value={title} onChangeText={setTitle} />
            )}
            <Field label={t('safety.removalMessage')} value={message} onChangeText={setMessage} multiline />
            <ErrorText>{problem === 'missing' ? t(allWorks ? 'safety.removalNeedsAuthor' : 'safety.removalNeedsTitle') : problem === 'send' ? t('safety.error') : null}</ErrorText>
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
