// The admin Moderation screen and "Wrong chapter count?" (docs/DECISIONS.md, "Moderation in v1").
// moderation_queue and moderation_resolve refuse everyone but admins; readers only ever insert
// their own chapter-count request (Row Level Security decides what is allowed).
import { supabase } from './supabase';

export type QueueKind = 'comment_report' | 'review_report' | 'user_report' | 'removal_request' | 'feedback' | 'chapter_count';

/** What a moderator can do with an item; which ones apply depends on the kind (see ACTIONS). */
export type QueueAction = 'hide' | 'dismiss' | 'accept' | 'done';

/** One open item. Fields that make no sense for a kind are null (e.g. counts outside chapter_count). */
export type QueueItem = {
  kind: QueueKind;
  id: string;
  created_at: string;
  story_id: string | null;
  story_title: string | null;
  /** The comment/review author, the reported reader, or the reader asking for a count. */
  subject: string | null;
  /** Comment, review, removal message or feedback text, cut at 280 characters. */
  excerpt: string | null;
  /** The report reason, or the feedback kind. */
  reason: string | null;
  details: string | null;
  contact: string | null;
  story_url: string | null;
  current_count: number | null;
  proposed_count: number | null;
  /** Open reports on the same comment, review or reader (this one included). */
  reporter_count: number | null;
};

/** The actions each kind offers, the main one first. User reports are dismiss-only (no banning in v1). */
export const ACTIONS: Record<QueueKind, readonly QueueAction[]> = {
  comment_report: ['hide', 'dismiss'],
  review_report: ['hide', 'dismiss'],
  user_report: ['dismiss'],
  removal_request: ['hide', 'dismiss'],
  chapter_count: ['accept', 'dismiss'],
  feedback: ['done', 'dismiss'],
};

/** Every open item, newest first. */
export async function fetchQueue(): Promise<QueueItem[]> {
  const { data, error } = await supabase.rpc('moderation_queue');
  if (error) throw error;
  return (data ?? []) as QueueItem[];
}

/** How mail to the moderator is doing (admins only): failures in the last 24 hours and the latest status code. */
export type EmailHealth = { failures: number; last_status: number | null; to_address: string };

export async function fetchEmailHealth(): Promise<EmailHealth> {
  const { data, error } = await supabase.rpc('moderation_email_health');
  if (error) throw error;
  const row = (data as EmailHealth[] | null)?.[0];
  if (!row) throw new Error('moderation_email_health returned no row');
  return row;
}

export async function resolve(kind: QueueKind, id: string, action: QueueAction): Promise<void> {
  const { error } = await supabase.rpc('moderation_resolve', { p_kind: kind, p_id: id, p_action: action });
  if (error) throw error;
}

/** A reader with the book in their library says its chapter count is wrong; a moderator decides. */
export async function requestChapterCount(storyId: string, proposed: number): Promise<void> {
  const { error } = await supabase.from('chapter_count_requests').insert({ story_id: storyId, proposed });
  if (error) throw error;
}

/** The Postgres error code of a failure (Supabase errors carry it as `code`). */
export const errorCode = (error: unknown) => (error as { code?: string } | null)?.code;
