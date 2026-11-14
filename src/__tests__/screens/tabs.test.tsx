import { fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import TabsLayout from '../../../app/(tabs)/_layout';
import { renderScreen } from '../../../test/router';

// The tab bar gives the active tab more room. It must learn which tab is active without calling
// navigation.isFocused() while rendering: React Navigation 8 (Expo SDK 58) warns about that.
function stand(name: string) {
  function StandIn() {
    return <Text>{`${name} screen`}</Text>;
  }
  return StandIn;
}
const tabs = {
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': stand('home'),
  '(tabs)/library': stand('library'),
  '(tabs)/discover': stand('discover'),
  '(tabs)/profile': stand('profile'),
};

it('switches tabs without asking navigation.isFocused() during render', async () => {
  const warn = jest.spyOn(console, 'warn');
  try {
    await renderScreen('en', tabs, '/');
    expect(await screen.findByText('home screen')).toBeOnTheScreen();
    fireEvent.press(screen.getByLabelText('Library'));
    expect(await screen.findByText('library screen')).toBeOnTheScreen();
    const isFocusedWarnings = warn.mock.calls.filter((args) => String(args[0]).includes('isFocused'));
    expect(isFocusedWarnings).toEqual([]);
  } finally {
    warn.mockRestore();
  }
});
