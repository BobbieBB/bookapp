// Chapter Discussions and The Epilogue (docs/DECISIONS.md, Spoiler Safe Mode and Visual design).
// The spoiler wall is enforced by the database (can_access_section, the comments policies and
// Realtime's RLS); this module only loads and saves.
import { supabase } from './supabase';

export type RoomKind = 'chapter' | 'epilogue';
export const REACTIONS = ['❤️', '😭', '😱', '😂', '🔥', '👀'] as const;
export type Emoji = (typeof REACTIONS)[number];

export type Room = {
  kind: RoomKind;
  section_number: number | null;
  unlocked: boolean;
  readers: number;
  comments: number | null; // null for rooms you haven't unlocked
};

export type Comment = {
  id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  author: { id: string; username: string };
  reactions: { emoji: Emoji; count: number; mine: boolean }[];
};

export type Thread = { comment: Comment; replies: Comment[] };

const byTime = (a: Comment, b: Comment) => a.created_at.localeCompare(b.created_at);

/** Top-level comments with their replies, oldest first. Replies to a comment you can't see are left out. */
export function threadComments(comments: Comment[]): Thread[] {
  const sorted = [...comments].sort(byTime);
  const threads = new Map<string, Thread>();
  for (const comment of sorted) if (!comment.parent_id) threads.set(comment.id, { comment, replies: [] });
  for (const comment of sorted) if (comment.parent_id) threads.get(comment.parent_id)?.replies.push(comment);
  return [...threads.values()];
}

/** Long threads show their last 2 replies and "View N earlier replies". */
export function visibleReplies(replies: Comment[], expanded: boolean): { shown: Comment[]; earlier: number } {
  if (expanded || replies.length <= 2) return { shown: replies, earlier: 0 };
  return { shown: replies.slice(-2), earlier: replies.length - 2 };
}

export async function loadRooms(storyId: string): Promise<Room[]> {
  const { data, error } = await supabase.rpc('story_rooms', { p_story: storyId });
  if (error) throw error;
  return (data as Room[]).map((r) => ({ ...r, readers: Number(r.readers), comments: r.comments === null ? null : Number(r.comments) }));
}

/** The discussion for a room you unlocked (created on first use). Locked rooms are refused. */
export async function openRoom(storyId: string, kind: RoomKind, section: number | null): Promise<{ id: string }> {
  const { data, error } = await supabase.rpc('open_discussion', { p_story: storyId, p_kind: kind, p_section: section });
  if (error) throw error;
  return { id: (data as { id: string }).id };
}

type CommentRow = Omit<Comment, 'reactions'> & { reactions: { emoji: Emoji; user_id: string }[] };

export async function loadComments(discussionId: string): Promise<Comment[]> {
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  const { data, error } = await supabase
    .from('comments')
    .select('id, parent_id, body, created_at, edited_at, deleted_at, author:profiles!comments_author_id_fkey (id, username), reactions (emoji, user_id)')
    .eq('discussion_id', discussionId)
    .order('created_at');
  if (error) throw error;
  return (data as unknown as CommentRow[]).map(({ reactions, ...c }) => ({
    ...c,
    reactions: REACTIONS.flatMap((emoji) => {
      const mine = reactions.filter((r) => r.emoji === emoji);
      return mine.length ? [{ emoji, count: mine.length, mine: mine.some((r) => r.user_id === me) }] : [];
    }),
  }));
}

export async function postComment(discussionId: string, body: string, parentId?: string): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('comments')
    .insert({ discussion_id: discussionId, body: body.trim(), parent_id: parentId ?? null })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

/** Deleting keeps the comment's place in the thread (replies stay readable) and erases its text. */
export async function deleteComment(commentId: string) {
  const { error } = await supabase.from('comments').update({ deleted_at: new Date().toISOString() }).eq('id', commentId);
  if (error) throw error;
}

export async function toggleReaction(commentId: string, emoji: Emoji, mine: boolean) {
  const { error } = mine
    ? await supabase.from('reactions').delete().eq('comment_id', commentId).eq('emoji', emoji).eq('user_id', (await me()) ?? '')
    : await supabase.from('reactions').insert({ comment_id: commentId, emoji });
  if (error) throw error;
}

async function me() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Remembers when you last read a room (for "N new comments" hints). */
export async function markRead(discussionId: string) {
  const { error } = await supabase
    .from('discussion_follows')
    .upsert({ discussion_id: discussionId, last_read_at: new Date().toISOString() }, { onConflict: 'user_id,discussion_id' });
  if (error) throw error;
}

/**
 * Calls `onChange` when a comment in the room is added, edited or deleted. Resolves once the
 * subscription is live; the returned function unsubscribes.
 */
export function subscribeToRoom(discussionId: string, onChange: () => void): Promise<() => void> {
  return new Promise((resolve, reject) => {
    const channel = supabase
      .channel(`room:${discussionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `discussion_id=eq.${discussionId}` }, onChange)
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') resolve(() => void supabase.removeChannel(channel));
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          void supabase.removeChannel(channel);
          reject(err ?? new Error(`live updates unavailable (${status})`));
        }
      });
  });
}
