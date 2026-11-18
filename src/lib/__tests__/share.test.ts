import { Share } from 'react-native';

import { translate } from '../../i18n';
import { shareMessage, shareStory, shareUrl, storyPathFromUrl } from '../share';

// "Share with a friend" (PO, 16 Nov 2026): one story, its title and a link; never how far you've read.
const en = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate('en', key, params);
const bg = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate('bg', key, params);
const id = '0b7c1e2a-3f4d-4e5f-8a9b-0c1d2e3f4a5b';

it('the link is livami.app/s/<id>', () => {
  expect(shareUrl(id)).toBe(`https://livami.app/s/${id}`);
});

it('the message has the title and the link, in the reader’s language; true whatever you did with the story', () => {
  expect(shareMessage({ id, title: 'Iron Flame' }, en)).toBe(`Come and talk about “Iron Flame” with me on Livami! https://livami.app/s/${id}`);
  expect(shareMessage({ id, title: 'The Lantern Keeper' }, bg)).toBe(`Ела да обсъждаме „The Lantern Keeper“ в Livami! https://livami.app/s/${id}`);
});

it('never says how far you have read, in either language', () => {
  expect(shareMessage({ id, title: 'Iron Flame' }, en)).not.toMatch(/chapter|page|%|reading/i);
  expect(shareMessage({ id, title: 'Iron Flame' }, bg)).not.toMatch(/глав|стр|%|чета/i);
});

it('opens the phone’s share sheet with that message', async () => {
  const spy = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
  try {
    await shareStory({ id, title: 'Iron Flame' }, en);
    expect(spy).toHaveBeenCalledWith({ message: shareMessage({ id, title: 'Iron Flame' }, en) });
  } finally {
    spy.mockRestore();
  }
});

it('a shared link gives the story path; anything else gives nothing', () => {
  expect(storyPathFromUrl(`livami://story/${id}`)).toBe(`/story/${id}`);
  expect(storyPathFromUrl(`livami:///story/${id.toUpperCase()}`)).toBe(`/story/${id}`);
  expect(storyPathFromUrl(`https://livami.app/s/${id}`)).toBe(`/story/${id}`);
  expect(storyPathFromUrl(`https://livami.app/s/${id}/?ref=x`)).toBe(`/story/${id}`);
  expect(storyPathFromUrl('livami://story/not-a-story')).toBeNull();
  expect(storyPathFromUrl(`livami://room/${id}/epilogue`)).toBeNull();
  expect(storyPathFromUrl(`https://evil.example/s/${id}`)).toBeNull();
  expect(storyPathFromUrl(`livami://story/${id}/../../admin`)).toBeNull();
});
