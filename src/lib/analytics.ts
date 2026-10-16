// First-party analytics (docs/DECISIONS.md, Dev defaults): which features get used, never content.
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
  | 'cover_set';

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

export async function track(name: AnalyticsEvent, props: Record<string, Value> = {}): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return false;
    const { error } = await supabase
      .from('analytics_events')
      .insert({ name, props: cleanProps(props), app_version: APP_VERSION, platform });
    return !error;
  } catch {
    return false;
  }
}
