// Replies and @mentions to you, and "N new comments" hints (docs/DECISIONS.md, Home). The database
// decides what may be shown (my_notifications, continue_reading_hints): never comment text, and
// nothing from a room you can't open.
import { supabase } from './supabase';

export type Notification = {
  id: string;
  type: 'reply' | 'reaction' | 'mention';
  created_at: string;
  read_at: string | null;
  actor_username: string | null;
  story_id: string;
  story_title: string;
  story_kind: 'book' | 'fanfic';
  room_kind: 'chapter' | 'epilogue';
  section_number: number | null;
  comment_id: string | null;
};

export type ReadingHint = { story_id: string; section_number: number; new_comments: number };

export async function myNotifications(limit = 50, types?: Notification['type'][]): Promise<Notification[]> {
  const { data, error } = await supabase.rpc('my_notifications', { p_limit: limit, p_types: types ?? null });
  if (error) throw error;
  return data as Notification[];
}

/** Home's "REPLIES TO YOU": replies and mentions only (reactions live on the notifications screen). */
export async function repliesToYou(limit = 3): Promise<Notification[]> {
  return myNotifications(limit, ['reply', 'mention']);
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

/** Where a notification leads: its room (the room screen re-checks the spoiler wall). */
export const roomPath = (n: Pick<Notification, 'story_id' | 'room_kind' | 'section_number'>) =>
  `/room/${n.story_id}/${n.room_kind === 'epilogue' ? 'epilogue' : n.section_number}`;
