// "Share" a book or fic with a friend (PO, 16 Nov 2026; Trello "Сподели книга/фикшън с приятел").
// One story, never the library, and never how far you've read: the message has the title and a link to
// livami.app/s/<id>, which opens the story in Livami when it is installed.
import { Share } from 'react-native';

import type { Translate } from './library';

export const SHARE_BASE = 'https://livami.app/s/';

export const shareUrl = (storyId: string) => `${SHARE_BASE}${storyId}`;

const STORY_LINK = /^(?:livami:\/\/\/?story\/|https:\/\/(?:www\.)?livami\.app\/s\/)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?(?:[?#].*)?$/i;

/** The app path for a shared story link (livami://story/<id> or livami.app/s/<id>), else null. */
export function storyPathFromUrl(url: string): `/story/${string}` | null {
  const m = STORY_LINK.exec(url.trim());
  return m ? `/story/${m[1].toLowerCase()}` : null;
}

/** The message for the phone's share sheet: title and link only, no progress (no spoilers). */
// "Come and talk about … with me", not "I'm reading …": the button is on every story page, including stories
// you haven't started, finished or put down, and the line is true for all of them (and needs no gender in Bulgarian).
export function shareMessage(story: { id: string; title: string }, t: Translate): string {
  return t('story.shareMessage', { title: story.title, url: shareUrl(story.id) });
}

/** Opens the phone's share sheet. A dismissed sheet is not an error. */
export async function shareStory(story: { id: string; title: string }, t: Translate) {
  await Share.share({ message: shareMessage(story, t) });
}
