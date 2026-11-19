// A shared story link (livami.app/s/<id> → "Open in Livami" → livami://story/<id>) opened by someone who isn't
// in the app yet: signed out, without a profile, or with terms to accept. The router sends them to those screens
// first and would forget the story; this remembers it and opens it once they are in.
import { useLinkingURL } from 'expo-linking';
import { router, useRootNavigationState } from 'expo-router';
import { useEffect } from 'react';

import { storyPathFromUrl } from '@/lib/share';

// Module state, not a ref: the root swaps to a loading screen while the profile loads after sign-in, which unmounts
// this component on the way in.
let pending: string | null = null;
let seen: string | null = null;

/** For tests: forget any remembered link. */
export function resetPendingStoryLink() {
  pending = null;
  seen = null;
}

export function PendingStoryLink({ onboarded }: { onboarded: boolean }) {
  const url = useLinkingURL();
  const ready = !!useRootNavigationState()?.key;

  useEffect(() => {
    if (!url || url === seen) return;
    seen = url;
    // Already in: the router opens the story itself.
    const path = storyPathFromUrl(url);
    if (path && !onboarded) pending = path;
  }, [url, onboarded]);

  useEffect(() => {
    if (!onboarded || !ready || !pending) return;
    const path = pending;
    pending = null;
    router.push(path);
  }, [onboarded, ready]);

  return null;
}
