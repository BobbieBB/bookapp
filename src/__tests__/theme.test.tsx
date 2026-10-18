import { FONT_FILES } from '../fonts';
import { fonts } from '../theme';

// One font set for both languages (docs/DECISIONS.md, "Fonts: Unbounded + Sofia Sans"): every family
// must have Cyrillic, or a Bulgarian title inside the English UI falls back to the system font.
const LATIN_ONLY = /BricolageGrotesque|AtkinsonHyperlegible/;

it('uses Unbounded for headings and Sofia Sans for everything else', () => {
  expect(fonts.display).toBe('Unbounded_700Bold');
  expect(fonts.displaySemi).toBe('Unbounded_600SemiBold');
  expect(fonts.body).toBe('SofiaSans_400Regular');
  expect(fonts.bodyBold).toBe('SofiaSans_700Bold');
  expect(fonts.moment).toBe('CormorantGaramond_700Bold_Italic');
});

it('every font has Cyrillic', () => {
  for (const family of Object.values(fonts)) expect(family).not.toMatch(LATIN_ONLY);
});

it('every font the theme names is loaded at start-up, and nothing else', () => {
  expect(Object.keys(FONT_FILES).sort()).toEqual([...new Set(Object.values(fonts))].sort());
});
