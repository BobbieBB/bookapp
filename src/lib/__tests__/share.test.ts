import { Share } from 'react-native';

import { translate } from '../../i18n';
import { shareMessage, shareStory, shareUrl } from '../share';

// "Share with a friend" (PO, 16 Nov 2026): one story, its title and a link; never how far you've read.
const en = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate('en', key, params);
const bg = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate('bg', key, params);
const id = '0b7c1e2a-3f4d-4e5f-8a9b-0c1d2e3f4a5b';

it('the link is livami.app/s/<id>', () => {
  expect(shareUrl(id)).toBe(`https://livami.app/s/${id}`);
});

it('the message has the title and the link, in the reader’s language', () => {
  expect(shareMessage({ id, title: 'Iron Flame', kind: 'book' }, en)).toBe(
    `I’m reading “Iron Flame” on Livami. Come and talk about it with me! https://livami.app/s/${id}`,
  );
  expect(shareMessage({ id, title: 'Iron Flame', kind: 'book' }, bg)).toBe(`Чета „Iron Flame“ в Livami. Ела да я обсъждаме! https://livami.app/s/${id}`);
  expect(shareMessage({ id, title: 'The Lantern Keeper', kind: 'fanfic' }, bg)).toBe(
    `Чета „The Lantern Keeper“ в Livami. Ела да го обсъждаме! https://livami.app/s/${id}`,
  );
});

it('never says how far you have read', () => {
  const message = shareMessage({ id, title: 'Iron Flame', kind: 'book' }, en);
  expect(message).not.toMatch(/chapter|page|%/i);
});

it('opens the phone’s share sheet with that message', async () => {
  const spy = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
  try {
    await shareStory({ id, title: 'Iron Flame', kind: 'book' }, en);
    expect(spy).toHaveBeenCalledWith({ message: shareMessage({ id, title: 'Iron Flame', kind: 'book' }, en) });
  } finally {
    spy.mockRestore();
  }
});
