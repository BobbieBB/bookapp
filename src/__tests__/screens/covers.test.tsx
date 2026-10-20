import { fireEvent, screen } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';

import StoryScreen from '../../../app/story/[id]';
import { renderScreen } from '../../../test/router';
import { addToLibrary, createManualBook } from '../../lib/stories';
import { supabase } from '../../lib/supabase';

// Private custom covers on the story page (docs/DECISIONS.md, "Custom covers"). The photo library is
// a native module, so the picker is the one stand-in; upload and storage are real (local Supabase).
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(),
}));
// Resizing is native too: it hands back what the test sets as the saved image.
let mockSaved = '';
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: () => ({
      resize: () => undefined,
      renderAsync: async () => ({ saveAsync: async () => ({ uri: 'file:///resized.jpg', width: 800, height: 1200, base64: mockSaved }) }),
    }),
  },
}));
const pick = ImagePicker.launchImageLibraryAsync as jest.Mock;
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const password = 'test-password-1234';
const run = Date.now().toString(36);
let me: string;
let mineId: string;
let notMineId: string;

beforeAll(async () => {
  const email = `coverui-${run}@example.test`;
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data.user) throw error ?? new Error('could not sign up');
  me = data.user.id;
  await supabase.from('profiles').insert({ id: me, username: `coverui_${run}` }).throwOnError();
  mineId = (await createManualBook({ title: 'Mine To Cover', author: 'x', chapters: 2, language: 'en' })).id;
  await addToLibrary(mineId, 'currently_reading');
  notMineId = (await createManualBook({ title: 'Not Mine', author: 'x', chapters: 2, language: 'en' })).id;
});

it('explains why the cover is private before you pick, then offers to change it', async () => {
  mockSaved = PNG_BASE64;
  pick.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///cover.png', mimeType: 'image/png' }] });
  await renderScreen('en', { 'story/[id]': StoryScreen }, `/story/${mineId}`);
  await fireEvent.press(await screen.findByRole('button', { name: 'Use my own cover' }, { timeout: 8000 }));
  expect(
    screen.getByText(
      'A cover just for you. Only you will see this cover. We never share it or show it to other readers, because the art belongs to the person who made it.',
    ),
  ).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Choose an image'));
  expect(await screen.findByRole('button', { name: 'Change my cover' }, { timeout: 8000 })).toBeOnTheScreen();
  expect(screen.queryByText('Only you see this cover.')).toBeNull(); // no permanent note under the cover
  expect(screen.queryByText('We couldn’t save your cover. Please try again.')).toBeNull();
  const { data } = await supabase.from('custom_covers').select('path').eq('story_id', mineId).single().throwOnError();
  expect(data!.path.startsWith(`${me}/`)).toBe(true);
});

it('"Change my cover" reminds you it is private and lets you go back to the usual cover', async () => {
  await renderScreen('en', { 'story/[id]': StoryScreen }, `/story/${mineId}`);
  await fireEvent.press(await screen.findByRole('button', { name: 'Change my cover' }, { timeout: 8000 }));
  expect(screen.getByText('Only you see this cover.')).toBeOnTheScreen();
  expect(screen.getByText('Choose another image')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Remove my cover'));
  expect(await screen.findByRole('button', { name: 'Use my own cover' }, { timeout: 8000 })).toBeOnTheScreen();
  const { data } = await supabase.from('custom_covers').select('path').eq('story_id', mineId).maybeSingle().throwOnError();
  expect(data).toBeNull();
});

it('an image still too big after resizing gets a clear message', async () => {
  mockSaved = 'A'.repeat(7 * 1024 * 1024); // ~5.25 MB once decoded
  pick.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///huge.jpg', mimeType: 'image/jpeg' }] });
  await renderScreen('en', { 'story/[id]': StoryScreen }, `/story/${mineId}`);
  await fireEvent.press(await screen.findByRole('button', { name: 'Use my own cover' }, { timeout: 8000 }));
  await fireEvent.press(screen.getByText('Choose an image'));
  expect(await screen.findByText('That image is too big. Try a smaller one.', {}, { timeout: 8000 })).toBeOnTheScreen();
});

it('cancelling the picker changes nothing', async () => {
  pick.mockResolvedValueOnce({ canceled: true, assets: null });
  await renderScreen('en', { 'story/[id]': StoryScreen }, `/story/${mineId}`);
  await fireEvent.press(await screen.findByRole('button', { name: 'Use my own cover' }, { timeout: 8000 }));
  await fireEvent.press(screen.getByText('Choose an image'));
  expect(screen.queryByRole('button', { name: 'Change my cover' })).toBeNull();
});

it('only for stories in your library', async () => {
  await renderScreen('en', { 'story/[id]': StoryScreen }, `/story/${notMineId}`);
  await screen.findByTestId('story-title', {}, { timeout: 8000 });
  expect(screen.queryByRole('button', { name: 'Use my own cover' })).toBeNull();
});

it('in Bulgarian', async () => {
  await renderScreen('bg', { 'story/[id]': StoryScreen }, `/story/${mineId}`);
  expect(await screen.findByText('Моя собствена корица', {}, { timeout: 8000 })).toBeOnTheScreen();
});
