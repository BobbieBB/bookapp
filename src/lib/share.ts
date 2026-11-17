// "Share" a book or fic with a friend (PO, 16 Nov 2026; Trello "Сподели книга/фикшън с приятел").
// One story, never the library, and never how far you've read: the message has the title and a link to
// livami.app/s/<id>, which opens the story in Livami when it is installed.
import { Share } from 'react-native';

import type { Translate } from './library';

export const SHARE_BASE = 'https://livami.app/s/';

export const shareUrl = (storyId: string) => `${SHARE_BASE}${storyId}`;

/** The message for the phone's share sheet: title and link only, no progress (no spoilers). */
export function shareMessage(story: { id: string; title: string; kind: 'book' | 'fanfic' }, t: Translate): string {
  const key = story.kind === 'book' ? 'story.shareMessageBook' : 'story.shareMessageFic';
  return t(key, { title: story.title, url: shareUrl(story.id) });
}

/** Opens the phone's share sheet. A dismissed sheet is not an error. */
export async function shareStory(story: { id: string; title: string; kind: 'book' | 'fanfic' }, t: Translate) {
  await Share.share({ message: shareMessage(story, t) });
}
