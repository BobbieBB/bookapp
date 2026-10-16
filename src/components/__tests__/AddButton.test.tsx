import { screen } from '@testing-library/react-native';

import { renderIn } from '../../../test/i18n';
import { AddButton } from '../AddButton';

it('is labelled for screen readers in the app language', async () => {
  await renderIn('bg', <AddButton />);
  expect(screen.getByLabelText('Добави история')).toBeOnTheScreen();
});
