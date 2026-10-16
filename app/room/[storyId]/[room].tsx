import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useEffectEvent, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CommentCard } from '@/components/CommentCard';
import { Button, ErrorText, T } from '@/components/ui';
import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import {
  deleteComment,
  loadComments,
  markRead,
  openRoom,
  postComment,
  subscribeToRoom,
  threadComments,
  toggleReaction,
  visibleReplies,
  type Comment,
  type Emoji,
  type Thread,
} from '@/lib/discussions';
import { block, reportComment } from '@/lib/safety';
import { track } from '@/lib/analytics';
import { finishChapter, loadStoryPage, nextChapter } from '@/lib/story';
import { useLookup } from '@/lib/useLookup';
import { radius, space, useTheme } from '@/theme';

const isLocked = (e: unknown) => (e as { message?: unknown } | null)?.message?.toString().startsWith('locked') === true;

/** "chapter 3" -> 3, "epilogue" -> null; anything else is not a room. */
function parseRoom(room: string | undefined): { kind: 'chapter'; n: number } | { kind: 'epilogue' } | null {
  if (room === 'epilogue') return { kind: 'epilogue' };
  const n = Number(room);
  return Number.isInteger(n) && n > 0 ? { kind: 'chapter', n } : null;
}

export default function RoomScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;
  const params = useLocalSearchParams<{ storyId: string; room: string }>();
  const target = parseRoom(params.room);
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((n) => n + 1);

  const room = useLookup(target ? `${params.storyId}:${params.room}:${tick}` : null, () =>
    openRoom(params.storyId, target!.kind, target!.kind === 'chapter' ? target!.n : null),
  );
  const story = useLookup(userId ? `${params.storyId}:${userId}:${tick}` : null, () => loadStoryPage(params.storyId, userId!));
  const page = story.data ?? story.previous;
  const opened = room.error ? null : (room.data ?? room.previous);
  const [commentsTick, setCommentsTick] = useState(0);
  const reloadComments = () => setCommentsTick((n) => n + 1);
  const comments = useLookup(opened ? `${opened.id}:${commentsTick}` : null, () => loadComments(opened!.id));
  const list = comments.data ?? comments.previous;

  if (!target || (!room.error && !opened) || (!page && story.loading) || (opened && !list && comments.loading)) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.ground, justifyContent: 'center', padding: space.xl }}>
        {!target ? <ErrorText>{t('room.error')}</ErrorText> : <ActivityIndicator color={c.primary} />}
      </SafeAreaView>
    );
  }

  const next = page?.entry ? nextChapter(page.story, page.entry.progress_section ?? 0) : null;
  const locked = isLocked(room.error);
  const finishAndTrack = async (chapter: NonNullable<typeof next>, uid: string) => {
    await finishChapter(params.storyId, uid, chapter);
    if (page) void track('chapter_finished', { kind: page.story.kind });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.ground }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.l }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'flex-start' }}>
            <Button variant="link" title={t('room.back')} onPress={() => router.back()} />
          </View>
          <View style={{ gap: space.xs }}>
            <T v="moment">
              <Text testID="room-title">{target.kind === 'epilogue' ? t('room.epilogue') : t('room.chapter', { n: target.n })}</Text>
            </T>
            <T v="muted">{t('room.subtitle')}</T>
          </View>
          {next && userId ? (
            <FinishPill
              label={t('room.finishedPill', { n: next.chapter })}
              onDone={() => finishAndTrack(next, userId)}
              onChanged={refresh}
            />
          ) : null}
          {room.error ? (
            locked ? (
              <T>{target.kind === 'epilogue' ? t('room.lockedEpilogue') : t('room.lockedChapter', { n: target.n })}</T>
            ) : (
              <ErrorText>{t('room.error')}</ErrorText>
            )
          ) : opened ? (
            <Discussion
              discussionId={opened.id}
              list={list}
              loadFailed={!!comments.error}
              reload={reloadComments}
              userId={userId}
              finishRow={next && userId ? { label: t('room.finishedRow', { n: next.chapter }), onDone: () => finishAndTrack(next, userId), onChanged: refresh } : null}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FinishPill({ label, onDone, onChanged }: { label: string; onDone: () => Promise<void>; onChanged: () => void }) {
  const { c, fonts } = useTheme();
  const t = useT();
  const [error, setError] = useState(false);
  return (
    <View style={{ alignItems: 'flex-start', gap: space.xs }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setError(false);
          onDone().then(onChanged, () => setError(true));
        }}
        style={{ minHeight: 44, paddingHorizontal: space.l, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: c.band }}
      >
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: c.ink }}>{label}</Text>
      </Pressable>
      {error ? <ErrorText>{t('room.error')}</ErrorText> : null}
    </View>
  );
}

type FinishRow = { label: string; onDone: () => Promise<void>; onChanged: () => void };

function Discussion({
  discussionId,
  list,
  loadFailed,
  reload,
  userId,
  finishRow,
}: {
  discussionId: string;
  list: Comment[] | undefined;
  loadFailed: boolean;
  reload: () => void;
  userId: string | undefined;
  finishRow: FinishRow | null;
}) {
  const { c, fonts } = useTheme();
  const t = useT();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [blockedNotice, setBlockedNotice] = useState(false);

  useEffect(() => {
    markRead(discussionId).catch(() => {
      // Only feeds "N new comments" hints; failing to record it must not disturb reading.
    });
  }, [discussionId]);

  const onLiveChange = useEffectEvent(reload);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let gone = false;
    subscribeToRoom(discussionId, () => onLiveChange()).then(
      (off) => {
        if (gone) off();
        else unsubscribe = off;
      },
      () => {
        // Live updates are unavailable: the room keeps working, it just refreshes on your own actions.
      },
    );
    return () => {
      gone = true;
      unsubscribe?.();
    };
  }, [discussionId]);

  const act = (work: () => Promise<unknown>) => {
    setFailed(false);
    return work().then(reload, () => setFailed(true));
  };

  const post = async () => {
    if (!draft.trim() || posting) return;
    setPosting(true);
    setFailed(false);
    try {
      await postComment(discussionId, draft, replyTo?.id);
      void track('comment_posted', { kind: replyTo ? 'reply' : 'comment' });
      setDraft('');
      setReplyTo(null);
      reload();
    } catch {
      setFailed(true);
    } finally {
      setPosting(false);
    }
  };

  const card = (comment: Thread['comment'], top: boolean) => (
    <CommentCard
      key={comment.id}
      comment={comment}
      mine={comment.author.id === userId}
      onReply={top ? () => setReplyTo({ id: comment.id, username: comment.author.username }) : undefined}
      onDelete={() => void act(() => deleteComment(comment.id))}
      onReact={(emoji: Emoji, mine: boolean) => void act(async () => {
          await toggleReaction(comment.id, emoji, mine);
          if (!mine) void track('reaction_added');
        })}
      onReport={(reason, details) => reportComment(comment.id, reason, details)}
      onBlock={async () => {
        await block(comment.author.id);
        setBlockedNotice(true);
        reload();
      }}
    />
  );

  const threads = list ? threadComments(list) : [];

  return (
    <View style={{ gap: space.m }}>
      {loadFailed && !list ? <ErrorText>{t('room.error')}</ErrorText> : null}
      {list && !threads.length ? <T v="muted">{t('room.empty')}</T> : null}
      {threads.map((thread) => {
        const { shown, earlier } = visibleReplies(thread.replies, expanded.has(thread.comment.id));
        return (
          <View key={thread.comment.id} testID={`thread-${thread.comment.id}`} style={{ gap: space.s }}>
            {card(thread.comment, true)}
            <View style={{ marginLeft: space.xl, gap: space.s }}>
              {earlier ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setExpanded((s) => new Set(s).add(thread.comment.id))}
                  style={{ minHeight: 44, justifyContent: 'center' }}
                >
                  <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: c.inkSoft, textDecorationLine: 'underline' }}>
                    {t('room.earlier', { count: earlier })}
                  </Text>
                </Pressable>
              ) : null}
              {shown.map((reply) => card(reply, false))}
            </View>
          </View>
        );
      })}

      {finishRow ? <FinishRowButton {...finishRow} /> : null}
      {failed ? <ErrorText>{t('room.error')}</ErrorText> : null}
      {blockedNotice ? (
        <Text accessibilityLiveRegion="polite" style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: c.success }}>
          {t('safety.blocked')}
        </Text>
      ) : null}

      <View style={{ gap: space.s }}>
        {replyTo ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <T v="muted">{t('room.replyingTo', { name: replyTo.username })}</T>
            <Button variant="link" title={t('room.cancel')} onPress={() => setReplyTo(null)} />
          </View>
        ) : null}
        <TextInput
          accessibilityLabel={t('room.add')}
          value={draft}
          onChangeText={setDraft}
          multiline
          placeholder={t('room.add')}
          placeholderTextColor={c.muted}
          style={{
            minHeight: 50,
            borderRadius: radius.s,
            borderWidth: 1.5,
            borderColor: c.hairline,
            backgroundColor: c.surface,
            paddingHorizontal: space.m,
            paddingVertical: space.m,
            fontSize: 16,
            fontFamily: fonts.body,
            color: c.ink,
          }}
        />
        <Button title={t('room.post')} onPress={() => void post()} disabled={!draft.trim()} loading={posting} />
      </View>
    </View>
  );
}

function FinishRowButton({ label, onDone, onChanged }: FinishRow) {
  const { c, fonts } = useTheme();
  const t = useT();
  const [error, setError] = useState(false);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setError(false);
          onDone().then(onChanged, () => setError(true));
        }}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text style={{ fontFamily: fonts.body, fontSize: 14, color: c.muted }}>{label}</Text>
      </Pressable>
      {error ? <ErrorText>{t('room.error')}</ErrorText> : null}
    </View>
  );
}
