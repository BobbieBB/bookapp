import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { useT } from '../../src/i18n';
import { renderIn } from '../i18n';

function SignOut() {
  return <Text testID="t">{useT()('common.signOut')}</Text>;
}

it('renders in the chosen language', async () => {
  await renderIn('bg', <SignOut />);
  expect(screen.getByTestId('t').props.children).toBe('Изход');
  await renderIn('en', <SignOut />);
  expect(screen.getAllByTestId('t').at(-1)?.props.children).toBe('Sign out');
});
