import { fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import TabsLayout from '../../../app/(tabs)/_layout';
import { renderScreen } from '../../../test/router';

// The pill tab bar (#63). On the PO's iPhone (SDK 58, 16 Nov) every tab tap threw "undefined is not a
// function": a tab's own navigation has no emit. Tapping a tab must switch to it, whichever navigation
// object the router hands the bar.
const stub = (name: string) => {
  const Screen = () => <Text>{`${name} screen`}</Text>;
  Screen.displayName = `${name}Stub`;
  return Screen;
};
const app = {
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': stub('home'),
  '(tabs)/library': stub('library'),
  '(tabs)/discover': stub('discover'),
  '(tabs)/profile': stub('profile'),
};

it('tapping a tab opens it, and the tab says it is selected', async () => {
  await renderScreen('en', app, '/');
  expect(await screen.findByText('home screen')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('tab', { name: 'Library' }));
  expect(await screen.findByText('library screen')).toBeOnTheScreen();
  expect(screen.getByRole('tab', { name: 'Library', selected: true })).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('tab', { name: 'Profile' }));
  expect(await screen.findByText('profile screen')).toBeOnTheScreen();
});

