// Report, block, feedback and author opt-out (docs/DECISIONS.md: Fandom etiquette by design, MVP v1).
// Who may see or change what is decided by the Row Level Security policies on each table.
import { APP_VERSION } from './config';
import { normaliseAo3Link } from './sources';
import { supabase } from './supabase';

export type FeedbackKind = 'problem' | 'idea' | 'other';
export type ReportReason = 'spam' | 'harassment' | 'spoiler' | 'inappropriate' | 'other';

async function check(query: PromiseLike<{ error: unknown }>) {
  const { error } = await query;
  if (error) throw error;
}

const cleanDetails = (details?: string) => (details?.trim() ? details.trim() : null);

export async function sendFeedback(kind: FeedbackKind, body: string) {
  if (!body.trim()) throw new Error('Feedback is empty.');
  await check(supabase.from('feedback').insert({ kind, body: body.trim(), app_version: APP_VERSION }));
}

/** An author asks for their fic to be hidden everywhere in the app (an admin processes it). */
export async function requestRemoval(r: { storyUrl: string; contact: string; message: string }) {
  const link = normaliseAo3Link(r.storyUrl);
  if (!link) throw new Error('That doesn’t look like an AO3 work link.');
  // An admin checks the request with the author before hiding the fic.
  if (r.contact.trim().length < 3) throw new Error('Tell us how we can reach you.');
  const { data: story, error } = await supabase.from('stories').select('id').eq('source_url', link).maybeSingle();
  if (error) throw error;
  await check(
    supabase.from('removal_requests').insert({
      story_id: story?.id ?? null,
      story_url: link,
      contact: r.contact.trim(),
      message: r.message.trim() || null,
    }),
  );
}

export async function reportComment(commentId: string, reason: ReportReason, details?: string) {
  // Only a comment you can see can be reported (so you can't probe locked rooms by id).
  const { data, error } = await supabase.from('comments').select('id').eq('id', commentId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('That comment is not available.');
  await check(supabase.from('reports').insert({ comment_id: commentId, reason, details: cleanDetails(details) }));
}

export async function reportUser(userId: string, reason: ReportReason, details?: string) {
  await check(supabase.from('reports').insert({ reported_user_id: userId, reason, details: cleanDetails(details) }));
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
