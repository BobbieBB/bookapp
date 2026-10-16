import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { fontsFor, useTheme } from '../theme';

// The UI fonts have no Cyrillic, so Bulgarian text would fall back to the system font.
const LATIN_ONLY = /BricolageGrotesque|AtkinsonHyperlegible/;

it('English uses the brand fonts', () => {
  expect(fontsFor('en').display).toBe('BricolageGrotesque_800ExtraBold');
  expect(fontsFor('en').body).toBe('AtkinsonHyperlegible_400Regular');
});

it('every Bulgarian font has Cyrillic', () => {
  for (const family of Object.values(fontsFor('bg'))) expect(family).not.toMatch(LATIN_ONLY);
});

it('both languages define the same font roles', () => {
  expect(Object.keys(fontsFor('bg')).sort()).toEqual(Object.keys(fontsFor('en')).sort());
});

it('useTheme falls back to the English fonts outside a LanguageProvider', async () => {
  function Probe() {
    return <Text testID="f">{useTheme().fonts.display}</Text>;
  }
  await render(<Probe />);
  expect(screen.getByTestId('f').props.children).toBe('BricolageGrotesque_800ExtraBold');
});
