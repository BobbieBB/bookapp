import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useEffectEvent, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CommentCard } from '@/components/CommentCard';
import { ExplicitDialog } from '@/components/ExplicitDialog';
import { PushOffer } from '@/components/PushOffer';
import { Button, ErrorText, T } from '@/components/ui';
import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { asksAdult } from '@/lib/explicit';
import { FINISH_PILL, LOCKED_ROOM, ROOM_NAME, sectionLabel } from '@/lib/sections';
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
import { mySuspension, useMySuspension } from '@/lib/suspension';
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
  const { session, profile, profileState } = useAuth();
  const userId = session?.user.id;
  const params = useLocalSearchParams<{ storyId: string; room: string }>();
  const target = parseRoom(params.room);
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((n) => n + 1);
  // The comment box sits at the end of the discussion: when the keyboard opens for it, scroll down so
  // the box stays in sight above the keyboard (PO's iPhone, 16 Nov and again 20 Nov: the keyboard
  // covered it). On iOS the scroll view itself makes room for the keyboard
  // (automaticallyAdjustKeyboardInsets): KeyboardAvoidingView's guess of the header height was off on
  // iOS 26, so the box ended up behind the keyboard. The scroll waits a moment for that inset.
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const writing = useRef(false);
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      if (writing.current) setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    });
    return () => sub.remove();
  }, []);
  const onComposerFocus = (focused: boolean) => {
    writing.current = focused;
    if (focused) setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 300);
  };

  // The room follows the reader's 18+ answer: after the yes it reloads, and the refusal it got before (an
  // Explicit fic's room is "locked" until then) is never shown in the meantime.
  const adult = profile?.adult_confirmed === true;
  const room = useLookup(target ? `${params.storyId}:${params.room}:${tick}:${adult}` : null, () =>
    openRoom(params.storyId, target!.kind, target!.kind === 'chapter' ? target!.n : null),
  );
  const story = useLookup(userId ? `${params.storyId}:${userId}:${tick}` : null, () => loadStoryPage(params.storyId, userId!));
  const page = story.data ?? story.previous;
  const opened = room.error ? null : (room.data ?? room.previous);
  const [commentsTick, setCommentsTick] = useState(0);
  const reloadComments = () => setCommentsTick((n) => n + 1);
  const comments = useLookup(opened ? `${opened.id}:${commentsTick}` : null, () => loadComments(opened!.id));
  const list = comments.data ?? comments.previous;

  // Until the profile is known, it is not known whether to ask: a "locked" refusal must not flash before the dialog.
  const waiting = profileState === 'loading' || (!room.error && !opened) || (!page && story.loading) || (opened && !list && comments.loading);
  if (!target || waiting) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.ground, justifyContent: 'center', padding: space.xl }}>
        {!target ? <ErrorText>{t('room.error')}</ErrorText> : <ActivityIndicator color={c.signal} />}
      </SafeAreaView>
    );
  }

  // "I finished chapter N" belongs in chapter rooms. The Epilogue only opens once the whole story is
  // Finished, so a next chapter there only shows up for an admin moderating it: no button then.
  const next = page?.entry && target.kind === 'chapter' ? nextChapter(page.story, page.entry.progress_section ?? 0) : null;
  const locked = isLocked(room.error);
  // Chapters, parts or acts: the story says (until it has loaded, chapters).
  const label = page ? sectionLabel(page.story) : 'chapter';
  // An Explicit fic's room reached without the 18+ yes (a link, a notification): ask here. The server
  // refuses the room until then (user_can_access_section); admins get in to moderate, so they are not asked.
  const asking = !!profile && !profile.is_admin && asksAdult(page?.story.content_rating, profile);
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace(`/story/${params.storyId}`);
  };
  const finishAndTrack = async (chapter: NonNullable<typeof next>, uid: string) => {
    await finishChapter(params.storyId, uid, chapter);
    if (page) void track('chapter_finished', { kind: page.story.kind });
  };
  // Finishing a chapter opens its discussion (PO, 16 Nov): straight into the new room, in place of this one.
  // A closed room's own chapter just reloads it, open.
  const goToNext = (chapter: NonNullable<typeof next>) => () =>
    target.kind === 'chapter' && chapter.chapter === target.n ? refresh() : router.replace(`/room/${params.storyId}/${chapter.chapter}`);

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: c.ground }}>
      <View style={{ flex: 1 }}>
        <ScrollView
          ref={scroll}
          contentContainerStyle={{ padding: space.xl, gap: space.l }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
        >
          <View style={{ gap: space.xs }}>
            <T v="moment">
              <Text testID="room-title">{target.kind === 'epilogue' ? t('room.epilogue') : t(ROOM_NAME[label], { n: target.n })}</Text>
            </T>
            {target.kind === 'epilogue' ? <T v="muted">{t('room.subtitle')}</T> : null}
          </View>
          {/* An open room is only its discussion (PO, 16 Nov: no "next chapter" prompts in it). A room still
              closed to you offers "I finished chapter N" as the way in. */}
          {next && userId && locked ? (
            <FinishPill
              label={t(FINISH_PILL[label], { n: next.chapter })}
              onDone={() => finishAndTrack(next, userId)}
              onChanged={goToNext(next)}
            />
          ) : null}
          {asking ? (
            <ExplicitDialog onBack={leave} />
          ) : room.error ? (
            locked ? (
              <T>{target.kind === 'epilogue' ? t('room.lockedEpilogue') : t(LOCKED_ROOM[label], { n: target.n })}</T>
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
              onComposerFocus={onComposerFocus}
            />
          ) : null}
        </ScrollView>
      </View>
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
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.ink }}>{label}</Text>
      </Pressable>
      {error ? <ErrorText>{t('room.error')}</ErrorText> : null}
    </View>
  );
}

function Discussion({
  discussionId,
  list,
  loadFailed,
  reload,
  userId,
  onComposerFocus,
}: {
  discussionId: string;
  list: Comment[] | undefined;
  loadFailed: boolean;
  reload: () => void;
  userId: string | undefined;
  onComposerFocus: (focused: boolean) => void;
}) {
  const { c, fonts } = useTheme();
  const t = useT();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(0); // comments posted here, for the push offer
  const [failed, setFailed] = useState(false);
  const [blockedNotice, setBlockedNotice] = useState(false);
  // A suspended reader still reads; posting and reacting are refused by the database, so the room
  // says why instead of a generic error (docs/DECISIONS.md, "Suspending a reader").
  const suspension = useMySuspension(discussionId);
  const [suspendedNotice, setSuspendedNotice] = useState(false);
  const suspended = suspension?.suspended === true || suspendedNotice;

  // A write failed: if it was because the reader is suspended (perhaps since they opened the room), say so.
  const explainFailure = async () => {
    const now = await mySuspension().catch(() => undefined);
    if (now?.suspended) setSuspendedNotice(true);
    else setFailed(true);
  };

  // Once per room reached, even by readers who only read (the PO's "readers who reach a discussion").
  useEffect(() => {
    void track('room_opened');
  }, [discussionId]);

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
    return work().then(reload, explainFailure);
  };

  const post = async () => {
    if (!draft.trim() || posting) return;
    setPosting(true);
    setFailed(false);
    try {
      await postComment(discussionId, draft, replyTo?.id);
      void track('comment_posted', { kind: replyTo ? 'reply' : 'comment' });
      setPosted((count) => count + 1);
      setDraft('');
      setReplyTo(null);
      reload();
    } catch {
      await explainFailure();
    } finally {
      setPosting(false);
    }
  };

  const card = (comment: Thread['comment'], top: boolean) => {
    // Null once the author deleted their account: nobody to block, but the comment can be reported.
    const author = comment.author;
    return (
      <CommentCard
        key={comment.id}
        comment={comment}
        mine={author !== null && author.id === userId}
        onReply={top ? () => setReplyTo({ id: comment.id, username: author?.username ?? t('account.deletedReader') }) : undefined}
        onDelete={() => void act(() => deleteComment(comment.id))}
        onReact={(emoji: Emoji, mine: boolean) => {
          if (suspended && !mine) {
            setSuspendedNotice(true); // say why at once, instead of a refusal from the database
            return;
          }
          void act(async () => {
            await toggleReaction(comment.id, emoji, mine);
            if (!mine) void track('reaction_added');
          });
        }}
        onReport={(reason, details) => reportComment(comment.id, reason, details)}
        onBlock={
          author
            ? async () => {
                await block(author.id);
                setBlockedNotice(true);
                reload();
              }
            : undefined
        }
      />
    );
  };

  const threads = list ? threadComments(list) : [];
  // Nothing anyone can read yet (no comments, or only deleted ones): the box invites the first one
  // (PO, 20 Nov: "Start the discussion" in an empty room).
  const quiet = threads.every((th) => th.comment.deleted_at && th.replies.every((r) => r.deleted_at));

  return (
    <View style={{ gap: space.m }}>
      {loadFailed && !list ? <ErrorText>{t('room.error')}</ErrorText> : null}
      {/* An empty room says it once, in the field: "Start the discussion…" (PO, 22 Nov 2026). */}
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
                  <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.inkSoft, textDecorationLine: 'underline' }}>
                    {t('room.earlier', { count: earlier })}
                  </Text>
                </Pressable>
              ) : null}
              {shown.map((reply) => card(reply, false))}
            </View>
          </View>
        );
      })}

      {failed ? <ErrorText>{t('room.error')}</ErrorText> : null}
      {blockedNotice ? (
        <Text accessibilityLiveRegion="polite" style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.success }}>
          {t('safety.blocked')}
        </Text>
      ) : null}

      {suspendedNotice ? (
        <View accessible accessibilityRole="alert">
          <ErrorText>{t('notifications.suspendedInRoom')}</ErrorText>
        </View>
      ) : suspended ? (
        <T v="muted">{t('notifications.suspendedInRoom')}</T>
      ) : null}
      {suspended ? null : (
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
            onFocus={() => onComposerFocus(true)}
            onBlur={() => onComposerFocus(false)}
            multiline
            placeholder={replyTo ? t('room.addReply', { name: replyTo.username }) : quiet ? t('room.start') : t('room.add')}
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
      )}
      <PushOffer posted={posted} />
    </View>
  );
}

