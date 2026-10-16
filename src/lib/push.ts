// Push notifications for replies and @mentions (docs/DECISIONS.md, Spoiler Safe Mode 5). The
// database writes each push (never comment text) and sends it; the app registers the device and
// opens the room when a push is tapped. The room screen checks the spoiler wall again.
import type { Language } from '@/i18n';

import { supabase } from './supabase';

const ROOM_URL = /^\/room\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(?:\d{1,4}|epilogue)$/;

/** Where tapping a push may lead: only a discussion room in the app. */
export function pushTarget(data: unknown): string | null {
  const url = (data as { url?: unknown } | null)?.url;
  return typeof url === 'string' && ROOM_URL.test(url) ? url : null;
}

/** Remembers this device for the signed-in reader (a phone can change hands: it moves to them). */
export async function registerPushToken(token: string, language: Language, platform: 'ios' | 'android') {
  const { error } = await supabase.rpc('claim_push_token', { p_token: token, p_language: language, p_platform: platform });
  if (error) throw error;
}

/** Forgets this device (on sign-out, or when the reader turns pushes off). */
export async function unregisterPushToken(token: string) {
  const { error } = await supabase.from('push_tokens').delete().eq('token', token);
  if (error) throw error;
}
