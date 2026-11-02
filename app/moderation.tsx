import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, ErrorText, T } from '@/components/ui';
import { useLanguage, useT } from '@/i18n';
import type { MessageKey } from '@/i18n/en';
import { ACTIONS, fetchQueue, resolve, type QueueAction, type QueueItem, type QueueKind } from '@/lib/moderation';
import { relativeTime } from '@/lib/relativeTime';
import { useLookup } from '@/lib/useLookup';
import { space, useTheme } from '@/theme';

// Profile > Moderation: the open reports and requests, newest first (docs/DECISIONS.md, "Moderation
// in v1"). Only admins get the link; the database refuses everyone else, and this screen says so.

// Postgres' "permission denied" (42501): moderation_queue refuses readers who are not admins.
const code = (error: unknown) => (error as { code?: string } | null)?.code;
const refused = (error: unknown) => code(error) === '42501';

const KIND_LABEL: Record<QueueKind, MessageKey> = {
  comment_report: 'moderation.kind.comment_report',
  review_report: 'moderation.kind.review_report',
  user_report: 'moderation.kind.user_report',
  removal_request: 'moderation.kind.removal_request',
  feedback: 'moderation.kind.feedback',
  chapter_count: 'moderation.kind.chapter_count',
};

// "Hide" says what is hidden, which depends on the kind.
const HIDE_LABEL: Partial<Record<QueueKind, MessageKey>> = {
  comment_report: 'moderation.hide.comment_report',
  review_report: 'moderation.hide.review_report',
  removal_request: 'moderation.hide.removal_request',
};

const REASON_LABEL: Record<string, MessageKey> = {
  spam: 'safety.reason.spam',
  harassment: 'safety.reason.harassment',
  spoiler: 'safety.reason.spoiler',
  inappropriate: 'safety.reason.inappropriate',
  other: 'safety.reason.other',
  problem: 'safety.kind.problem',
  idea: 'safety.kind.idea',
};

function actionLabel(kind: QueueKind, action: QueueAction): MessageKey {
  if (action === 'hide') return HIDE_LABEL[kind] ?? 'moderation.dismiss';
  if (action === 'accept') return 'moderation.accept';
  if (action === 'done') return 'moderation.done';
  return 'moderation.dismiss';
}

function QueueCard({ item, onResolved }: { item: QueueItem; onResolved: () => void }) {
  const t = useT();
  const { language } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function act(action: QueueAction) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await resolve(item.kind, item.id, action);
      onResolved(); // the card stays busy until the reload takes it off the list
    } catch (e) {
      const message = (e as { message?: string } | null)?.message ?? '';
      if (code(e) === '55000' && /no fic/.test(message)) setError(t('moderation.noFic'));
      else if (code(e) === '55000' || code(e) === 'P0002') {
        // Someone else got there first: the item is gone, so show the list as it is now.
        setError(t('moderation.gone'));
        onResolved();
      } else setError(t('moderation.failed'));
      setBusy(false);
    }
  }

  const reasonKey = item.reason ? REASON_LABEL[item.reason] : undefined;
  const reporters = item.reporter_count ?? 0;

  return (
    <Card>
      <View testID={`queue-${item.kind}-${item.id}`} style={{ gap: space.s }}>
        <T v="overline">{t(KIND_LABEL[item.kind])}</T>
        <T v="muted">{relativeTime(item.created_at, language)}</T>
        {item.story_title ? <T v="h2">{item.story_title}</T> : null}
        {item.subject ? <T v="label">{item.subject}</T> : null}
        {item.excerpt ? <T v="body">{item.excerpt}</T> : null}
        {reasonKey ? <T v="label">{t(reasonKey)}</T> : null}
        {item.details ? <T v="body">{item.details}</T> : null}
        {item.contact ? <T v="body">{item.contact}</T> : null}
        {item.story_url ? <T v="muted">{item.story_url}</T> : null}
        {item.current_count !== null && item.proposed_count !== null ? (
          <T v="label">{t('moderation.countChange', { count: item.proposed_count, current: item.current_count, proposed: item.proposed_count })}</T>
        ) : null}
        {reporters > 1 ? <T v="label">{t('moderation.reports', { count: reporters })}</T> : null}
        <ErrorText>{error}</ErrorText>
        {ACTIONS[item.kind].map((action, i) => (
          <Button
            key={action}
            variant={i === 0 ? 'primary' : 'secondary'}
            title={t(actionLabel(item.kind, action))}
            disabled={busy}
            onPress={() => act(action)}
          />
        ))}
      </View>
    </Card>
  );
}

export default function Moderation() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const [version, setVersion] = useState(0);
  const { data, error, previous } = useLookup(`moderation-queue-${version}`, fetchQueue);
  // After an action the list reloads; the old one stays on screen meanwhile instead of a spinner.
  const items = data ?? previous;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.ground }}>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.l }}>
        <View style={{ alignItems: 'flex-start' }}>
          <Button variant="link" title={t('moderation.back')} onPress={() => router.back()} />
        </View>
        <T v="h1">{t('moderation.title')}</T>
        {error !== undefined ? (
          <ErrorText>{refused(error) ? t('moderation.refused') : t('moderation.error')}</ErrorText>
        ) : !items ? (
          <ActivityIndicator color={c.primary} accessibilityLabel={t('moderation.loading')} />
        ) : items.length === 0 ? (
          <T v="muted">{t('moderation.empty')}</T>
        ) : (
          <>
            <T v="muted">{t('moderation.intro')}</T>
            {items.map((item) => (
              <QueueCard key={`${item.kind}-${item.id}`} item={item} onResolved={() => setVersion((v) => v + 1)} />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
