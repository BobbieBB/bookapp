import { fireEvent, screen, waitFor } from '@testing-library/react-native';
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

it('explains why the cover is private before you pick, then shows yours with a note', async () => {
  pick.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///cover.png', mimeType: 'image/png', base64: PNG_BASE64 }] });
  await renderScreen('en', { 'story/[id]': StoryScreen }, `/story/${mineId}`);
  await fireEvent.press(await screen.findByText('Use my own cover', {}, { timeout: 8000 }));
  expect(
    screen.getByText(
      'A cover just for you. Only you will see this cover. We never share it or show it to other readers, because the art belongs to the person who made it.',
    ),
  ).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Choose an image'));
  expect(await screen.findByText('Only you see this cover', {}, { timeout: 8000 })).toBeOnTheScreen();
  const { data } = await supabase.from('custom_covers').select('path').eq('story_id', mineId).single().throwOnError();
  expect(data!.path.startsWith(`${me}/`)).toBe(true);
});

it('you can go back to the usual cover', async () => {
  await renderScreen('en', { 'story/[id]': StoryScreen }, `/story/${mineId}`);
  await fireEvent.press(await screen.findByText('Remove my cover', {}, { timeout: 8000 }));
  await waitFor(() => expect(screen.queryByText('Only you see this cover')).toBeNull(), { timeout: 8000 });
  const { data } = await supabase.from('custom_covers').select('path').eq('story_id', mineId).maybeSingle().throwOnError();
  expect(data).toBeNull();
});

it('cancelling the picker changes nothing', async () => {
  pick.mockResolvedValueOnce({ canceled: true, assets: null });
  await renderScreen('en', { 'story/[id]': StoryScreen }, `/story/${mineId}`);
  await fireEvent.press(await screen.findByText('Use my own cover', {}, { timeout: 8000 }));
  await fireEvent.press(screen.getByText('Choose an image'));
  expect(screen.queryByText('Only you see this cover')).toBeNull();
});

it('only for stories in your library', async () => {
  await renderScreen('en', { 'story/[id]': StoryScreen }, `/story/${notMineId}`);
  await screen.findByTestId('story-title', {}, { timeout: 8000 });
  expect(screen.queryByText('Use my own cover')).toBeNull();
});

it('in Bulgarian', async () => {
  await renderScreen('bg', { 'story/[id]': StoryScreen }, `/story/${mineId}`);
  expect(await screen.findByText('Моя собствена корица', {}, { timeout: 8000 })).toBeOnTheScreen();
});
