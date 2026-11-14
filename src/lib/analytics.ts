// First-party analytics (docs/DECISIONS.md, "Analytics: opt-in"): which features get used, never content,
// and only for readers who said yes to "Help us improve the app".
// Events are a fixed list (also enforced by the database); properties are a few short, non-content
// values. Recording an event never gets in a reader's way: failures are swallowed and reported as false.
import { Platform } from 'react-native';

import { APP_VERSION } from './config';
import { supabase } from './supabase';

export type AnalyticsEvent =
  | 'app_open'
  | 'sign_up'
  | 'onboarding_done'
  | 'story_added'
  | 'chapter_finished'
  | 'story_finished'
  | 'comment_posted'
  | 'reaction_added'
  | 'discover_opened'
  | 'feedback_sent'
  | 'language_changed'
  | 'cover_set'
  | 'room_opened';

type Value = string | number | boolean;
const ALLOWED_KEYS = new Set(['kind', 'language', 'tier', 'count', 'wip', 'source', 'status']);
const MAX_TEXT = 40;

/** Only allowed keys with short plain values; everything else is dropped. */
export function cleanProps(props: Record<string, Value>): Record<string, Value> {
  return Object.fromEntries(
    Object.entries(props).filter(
      ([key, value]) =>
        ALLOWED_KEYS.has(key) &&
        (typeof value === 'number' || typeof value === 'boolean' || (typeof value === 'string' && value.length <= MAX_TEXT)),
    ),
  );
}

const platform = Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web' ? Platform.OS : null;

// The signed-in reader's "Help us improve the app" consent, read once per account and kept up to date by
// setAnalyticsConsent, so track() needn't ask the database before every event. A change made on another
// device reaches this one at the next start; until then consent withdrawn elsewhere is still enforced by
// the database (analytics_insert_own), so nothing is recorded against the reader's wish.
let consent: { userId: string; value: boolean } | null = null;
// Saves started and saves finished (either way). A read only fills the cache if no save was running when it
// started and none started since, so an older answer from the database never overwrites a newer choice.
let savesStarted = 0;
let savesFinished = 0;

async function signedInUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/** Whether the signed-in reader said yes to analytics (stored on the account, so it follows them). */
export async function analyticsConsent(signal?: AbortSignal): Promise<boolean> {
  const userId = await signedInUserId();
  if (!userId) return false;
  if (consent?.userId === userId) return consent.value;
  const started = savesStarted;
  const quiet = savesFinished === savesStarted;
  const query = supabase.from('analytics_consents').select('user_id').eq('user_id', userId);
  const { data } = await (signal ? query.abortSignal(signal) : query).throwOnError();
  const value = (data ?? []).length > 0;
  if (quiet && savesStarted === started) {
    consent = { userId, value };
    return value;
  }
  // A save overlapped this read: the save wins, so its value is answered when known.
  return consent?.userId === userId ? consent.value : value;
}

export async function setAnalyticsConsent(value: boolean): Promise<void> {
  const userId = await signedInUserId();
  if (!userId) throw new Error('not signed in');
  const save = ++savesStarted;
  // Until the save is known to have worked, nothing is cached, so a failed save is read again next time.
  consent = null;
  try {
    if (value) await supabase.from('analytics_consents').upsert({ user_id: userId }, { ignoreDuplicates: true }).throwOnError();
    else await supabase.from('analytics_consents').delete().eq('user_id', userId).throwOnError();
    // A later save (a quick double tap) owns the cache.
    if (save === savesStarted) consent = { userId, value };
  } finally {
    savesFinished += 1;
  }
}

/** Records an event, only if the reader said yes; before that (and signed out) nothing is sent. */
export async function track(name: AnalyticsEvent, props: Record<string, Value> = {}): Promise<boolean> {
  try {
    if (!(await signedInUserId()) || !(await analyticsConsent())) return false;
    const { error } = await supabase
      .from('analytics_events')
      .insert({ name, props: cleanProps(props), app_version: APP_VERSION, platform });
    return !error;
  } catch {
    return false;
  }
}
