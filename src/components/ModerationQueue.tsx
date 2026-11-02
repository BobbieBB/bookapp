import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, ErrorText, T } from '@/components/ui';
import { useLanguage, useT } from '@/i18n';
import type { MessageKey } from '@/i18n/en';
import { ACTIONS, errorCode, resolve, type QueueAction, type QueueItem, type QueueKind } from '@/lib/moderation';
import { relativeTime } from '@/lib/relativeTime';
import { space } from '@/theme';

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

// A button's name says which card it belongs to: the story and the person, or (feedback, a reader
// report without a story) the reason and the start of the text, so two cards never sound the same.
const EXCERPT_IN_LABEL = 40;

function excerptStart(text: string) {
  if (text.length <= EXCERPT_IN_LABEL) return text;
  const cut = text.slice(0, EXCERPT_IN_LABEL);
  const word = cut.lastIndexOf(' ');
  return `${(word > 0 ? cut.slice(0, word) : cut).trimEnd()}…`;
}

function QueueCard({ item, onDone, onResolved }: { item: QueueItem; onDone: () => void; onResolved: () => void }) {
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
      // Dealt with: the card leaves now, even if the reload that follows fails.
      onDone();
    } catch (e) {
      // MD001 / MD002: refused for a reason this item has (see moderation_resolve); the item stays.
      const failure = errorCode(e);
      if (failure === 'MD001') setError(t('moderation.noFic'));
      else if (failure === 'MD002') setError(t('moderation.cannotCount'));
      else if (failure === '55000' || failure === 'P0002') {
        // Someone else got there first: the item is gone, so show the list as it is now.
        setError(t('moderation.gone'));
        onResolved();
      } else setError(t('moderation.failed'));
      setBusy(false);
    }
  }

  const reasonKey = item.reason ? REASON_LABEL[item.reason] : undefined;
  const reporters = item.reporter_count ?? 0;
  const target =
    [item.story_title, item.subject].filter(Boolean).join(', ') ||
    [reasonKey ? t(reasonKey) : null, item.excerpt ? excerptStart(item.excerpt) : null].filter(Boolean).join(', ') ||
    t(KIND_LABEL[item.kind]);

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
            accessibilityLabel={t('moderation.actionLabel', {
              action: t(actionLabel(item.kind, action)),
              kind: t(KIND_LABEL[item.kind]),
              target,
            })}
            disabled={busy}
            onPress={() => act(action)}
          />
        ))}
      </View>
    </Card>
  );
}

const itemKey = (item: QueueItem) => `${item.kind}-${item.id}`;

/**
 * The open items as cards, or "Nothing to moderate". `onResolved` reloads the queue. An item acted on
 * leaves the list straight away ("An item leaves the list once you act on it"), not when the reload
 * comes back: if the reload fails the old list stays on screen, and the item would linger in it.
 */
export function ModerationQueue({ items, onResolved }: { items: QueueItem[]; onResolved: () => void }) {
  const t = useT();
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const open = items.filter((item) => !done.has(itemKey(item)));
  if (open.length === 0) return <T v="muted">{t('moderation.empty')}</T>;
  return (
    <>
      <T v="muted">{t('moderation.intro')}</T>
      {open.map((item) => (
        <QueueCard
          key={itemKey(item)}
          item={item}
          onDone={() => {
            setDone((before) => new Set(before).add(itemKey(item)));
            onResolved();
          }}
          onResolved={onResolved}
        />
      ))}
    </>
  );
}
