// Report, block, feedback and author opt-out (docs/DECISIONS.md: Fandom etiquette by design, MVP v1).
// Who may see or change what is decided by the Row Level Security policies on each table.
import { APP_VERSION } from './config';
import { supabase } from './supabase';

export type FeedbackKind = 'problem' | 'idea' | 'other';
export type ReportReason = 'spam' | 'harassment' | 'spoiler' | 'inappropriate' | 'other';

async function check(query: PromiseLike<{ error: unknown }>) {
  const { error } = await query;
  if (error) throw error;
}

/** A report is filed once per reader and target: filing it again is already done, not a failure (unique violation). */
async function checkReport(query: PromiseLike<{ error: { code?: string } | null }>) {
  const { error } = await query;
  if (error && error.code !== '23505') throw error;
}

const cleanDetails = (details?: string) => (details?.trim() ? details.trim() : null);

/** `wantsReply`: "I'd like a reply by e-mail", to the account's address (shown to the PO in the daily digest). */
export async function sendFeedback(kind: FeedbackKind, body: string, wantsReply = false) {
  if (!body.trim()) throw new Error('Feedback is empty.');
  await check(supabase.from('feedback').insert({ kind, body: body.trim(), app_version: APP_VERSION, wants_reply: wantsReply }));
}

/** An author asks for their fic to be hidden everywhere in the app (an admin processes it). */
/**
 * An author asks us to hide their fic (PO, 23 Nov 2026): only the fic's title and their author name, no AO3 link
 * and no contact details. The PO checks it by hand and replies to the e-mail of the requester's account. When
 * exactly one fic in the app has that title and author, the request points at it.
 */
export async function requestRemoval(r: { title: string; author: string; message: string }) {
  const title = r.title.trim();
  const author = r.author.trim();
  if (!title || !author) throw new Error('Tell us the title of the fic and your author name.');
  const exactly = (text: string) => text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  const { data: matches, error } = await supabase
    .from('stories')
    .select('id')
    .eq('kind', 'fanfic')
    .ilike('title', exactly(title))
    .ilike('author_name', exactly(author))
    .limit(2);
  if (error) throw error;
  await check(
    supabase.from('removal_requests').insert({
      story_id: matches?.length === 1 ? matches[0].id : null,
      fic_title: title,
      fic_author: author,
      message: r.message.trim() || null,
    }),
  );
}

export async function reportComment(commentId: string, reason: ReportReason, details?: string) {
  // Only a comment you can see can be reported (so you can't probe locked rooms by id).
  const { data, error } = await supabase.from('comments').select('id').eq('id', commentId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('That comment is not available.');
  await checkReport(supabase.from('reports').insert({ comment_id: commentId, reason, details: cleanDetails(details) }));
}

/** Another reader's review (the database refuses your own and a hidden one; a second report of the same review counts as done). */
export async function reportReview(reviewId: string, reason: ReportReason, details?: string) {
  await checkReport(supabase.from('reports').insert({ review_id: reviewId, reason, details: cleanDetails(details) }));
}

export async function reportUser(userId: string, reason: ReportReason, details?: string) {
  await checkReport(supabase.from('reports').insert({ reported_user_id: userId, reason, details: cleanDetails(details) }));
}

export async function block(userId: string) {
  await check(supabase.from('blocks').upsert({ blocked_id: userId }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true }));
}

export async function unblock(userId: string) {
  await check(supabase.from('blocks').delete().eq('blocked_id', userId));
}

/** Readers you blocked, by name. */
export async function blockedReaders(): Promise<{ id: string; username: string }[]> {
  const { data, error } = await supabase
    .from('blocks')
    .select('blocked:profiles!blocks_blocked_id_fkey (id, username)')
    .order('created_at');
  if (error) throw error;
  return (data as unknown as { blocked: { id: string; username: string } }[]).map((r) => r.blocked);
}
