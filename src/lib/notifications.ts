// Replies and @mentions to you, "N new comments" hints (docs/DECISIONS.md, Home), and moderation
// notices (Moderation notices). The database decides what may be shown (my_notifications,
// continue_reading_hints): never comment text, nothing from a room you can't open, and a moderation
// notice never names the other reader.
import type { ReportReason } from './safety';
import { supabase } from './supabase';

export type ModerationNoticeType = 'content_hidden' | 'report_resolved';

export type Notification = {
  id: string;
  type: 'reply' | 'reaction' | 'mention' | ModerationNoticeType;
  created_at: string;
  read_at: string | null;
  actor_username: string | null;
  /** Empty only for a notice about a report on a reader (no story). */
  story_id: string | null;
  story_title: string | null;
  story_kind: 'book' | 'fanfic' | null;
  /** Empty for a notice about a review or a reader (no room). */
  room_kind: 'chapter' | 'epilogue' | null;
  section_number: number | null;
  comment_id: string | null;
  /** Moderation notices only: what was reported, the reason it was hidden, and the decision. */
  content_kind: 'comment' | 'review' | 'reader' | null;
  reason: ReportReason | null;
  outcome: 'actioned' | 'dismissed' | null;
};

export const MODERATION_NOTICES: readonly ModerationNoticeType[] = ['content_hidden', 'report_resolved'];
export const isModerationNotice = (n: Pick<Notification, 'type'>): boolean => (MODERATION_NOTICES as readonly string[]).includes(n.type);

export type ReadingHint = { story_id: string; section_number: number; new_comments: number };

export async function myNotifications(limit = 50, types?: Notification['type'][]): Promise<Notification[]> {
  // my_notifications_v2: every kind, with the moderation notice columns (my_notifications stays as it was
  // for app builds that can't render them).
  const { data, error } = await supabase.rpc('my_notifications_v2', { p_limit: limit, p_types: types ?? null });
  if (error) throw error;
  // Only kinds this build can show: a room kind always with its room (never a link to /room/null/…),
  // or an account notice. Anything newer is left out rather than shown wrong.
  return (data as Notification[]).filter((n) =>
    isAccountNotification(n) ? true : KNOWN_ROOM_KINDS.includes(n.type) && n.story_id !== null,
  );
}

/** Home's "REPLIES TO YOU": replies and mentions only (reactions live on the notifications screen). */
export async function repliesToYou(limit = 3): Promise<RoomNotification[]> {
  return (await myNotifications(limit, ['reply', 'mention'])) as RoomNotification[];
}

/** Home's notices: moderation decisions about you or your reports, while still unread. */
export async function unreadModerationNotices(limit = 3): Promise<Notification[]> {
  return (await myNotifications(limit, [...MODERATION_NOTICES])).filter((n) => n.read_at === null);
}

/** Marks read what the reader was shown: everything up to the newest notification on screen. */
export async function markReadUpTo(newestShownAt: string) {
  const { error } = await supabase.rpc('mark_notifications_read', { p_until: newestShownAt });
  if (error) throw error;
}

export async function continueReadingHints(): Promise<Map<string, ReadingHint>> {
  const { data, error } = await supabase.rpc('continue_reading_hints');
  if (error) throw error;
  return new Map((data as ReadingHint[]).map((h) => [h.story_id, { ...h, new_comments: Number(h.new_comments) }]));
}

/** Where a notification leads: its room (the room screen re-checks the spoiler wall), or nowhere when it has none. */
export const roomPath = (n: Pick<Notification, 'story_id' | 'room_kind' | 'section_number'>): string | null => {
  if (!n.story_id || !n.room_kind) return null;
  if (n.room_kind === 'epilogue') return `/room/${n.story_id}/epilogue`;
  return n.section_number === null ? null : `/room/${n.story_id}/${n.section_number}`;
};
