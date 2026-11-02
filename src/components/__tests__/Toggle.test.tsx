import AsyncStorage from '@react-native-async-storage/async-storage';
import { screen, waitFor } from '@testing-library/react-native';

import { renderIn } from '../../../test/i18n';
import { APPEARANCE_STORAGE_KEY } from '../../appearance';
import { palettes } from '../../theme';
import { Toggle } from '../ui';

// The switch's thumb (RN passes thumbColor on as thumbTintColor) must come from the palette; the platform default is teal on web/Android (green in Calm).
const thumb = () => screen.getByLabelText('Sound').props as { thumbTintColor?: string; activeThumbColor?: string };

it.each(['light', 'dark', 'calm'] as const)('the thumb is the %s palette\'s thumb colour', async (mode) => {
  await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, mode);
  await renderIn('en', <Toggle label="Sound" value onChange={() => {}} />);
  await waitFor(() => expect(thumb().thumbTintColor).toMatch(/^#/));
  await waitFor(() => expect(thumb().thumbTintColor).toBe(palettes[mode].thumb));
  // react-native-web paints the ON thumb from activeThumbColor (default teal #009688), thumbColor only when off.
  expect(thumb().activeThumbColor).toBe(palettes[mode].thumb);
});
