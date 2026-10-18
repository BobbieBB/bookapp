// Ink & Bloom design tokens. Colours chosen 14 Oct 2026; modern look ("Modern A, bold
// colours": no outlines, soft shadows, rounder corners) chosen 15 Oct 2026.
// Same roles in light and dark:
// components ask for a role (e.g. `c.mine` for your own posts), never a hex.
import { useColorScheme } from 'react-native';

const light = {
  ground: '#F6F8F7',
  surface: '#FFFFFF',
  band: '#BFEBD8', // header band
  ink: '#1E1328', // text
  inkSoft: '#3B2F45',
  muted: '#4E4459',
  hairline: '#E0D9E5', // input borders, dividers
  shadow: '#1E1328', // soft shadow colour (used at low opacity)
  primary: '#FF4F84', // hot pink
  onPrimary: '#1E1328',
  secondary: '#3DBE95', // fresh mint
  onSecondary: '#1E1328',
  mine: '#FFE3EC', // your own posts
  safe: '#3DBE95', // spoiler-safe banner
  onSafe: '#1E1328',
  danger: '#B3123F',
  success: '#1F6B45',
  track: '#E9EEEB',
};

const dark: typeof light = {
  ground: '#120C17',
  surface: '#1F1726',
  band: '#13302A',
  ink: '#F7EEF3',
  inkSoft: '#EDE2EA',
  muted: '#B4A6BD',
  hairline: '#3A2F44',
  shadow: '#000000',
  primary: '#FF6B97', // rose
  onPrimary: '#1E1328',
  secondary: '#4FD1A6', // mint
  onSecondary: '#0F2A23',
  mine: '#3A1D2C',
  safe: '#8EE6CC',
  onSafe: '#0F2A23',
  danger: '#FF7A93',
  success: '#8EE6CC',
  track: '#2E2436',
};

export type Palette = typeof light;

// Cover colours for stories without a real cover (all fics, books without one).
// Picked from the story id, so a story has the same colour everywhere, for everyone.
// Decided 14 Oct 2026: by story, not by fandom.
const coverLight = [
  { bg: '#FF4F84', fg: '#1E1328' },
  { bg: '#3DBE95', fg: '#1E1328' },
  { bg: '#FFD3E1', fg: '#1E1328' },
  { bg: '#BFEBD8', fg: '#1E1328' },
  { bg: '#C9B6F2', fg: '#1E1328' },
  { bg: '#1E1328', fg: '#FFD3E1' },
];
const coverDark = [
  { bg: '#FF6B97', fg: '#1E1328' },
  { bg: '#4FD1A6', fg: '#0F2A23' },
  { bg: '#4A2338', fg: '#FFD3E1' },
  { bg: '#13302A', fg: '#A9F0DA' },
  { bg: '#3B2A5C', fg: '#E4DCF3' },
  { bg: '#F7EEF3', fg: '#1E1328' },
];

export function coverColor(storyId: string, isDark: boolean) {
  let h = 0;
  for (let i = 0; i < storyId.length; i++) h = (h * 31 + storyId.charCodeAt(i)) >>> 0;
  const set = isDark ? coverDark : coverLight;
  return set[h % set.length]!;
}

// Font family names as registered in app/_layout.tsx. One set for both languages; every family has
// Cyrillic (docs/DECISIONS.md, "Fonts: Unbounded + Sofia Sans"). Unbounded is wide: short text only.
export const fonts = {
  display: 'Unbounded_700Bold', // UI headings, book titles
  displaySemi: 'Unbounded_600SemiBold',
  moment: 'CormorantGaramond_700Bold_Italic', // emotional moments: The Epilogue, chapter titles
  body: 'SofiaSans_400Regular', // comments, buttons, labels
  bodyBold: 'SofiaSans_700Bold',
};

export const radius = { s: 14, m: 20, l: 22, pill: 999 };
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 };

/** Soft drop shadow (iOS shadow props + Android elevation). */
export function softShadow(isDark: boolean, strength: 'card' | 'small' = 'card') {
  const big = strength === 'card';
  return {
    shadowColor: isDark ? '#000000' : '#1E1328',
    shadowOffset: { width: 0, height: big ? 10 : 3 },
    shadowOpacity: isDark ? 0.35 : big ? 0.09 : 0.1,
    shadowRadius: big ? 22 : 6,
    elevation: big ? 4 : 2,
  };
}

export function useTheme() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const c = isDark ? dark : light;
  return {
    isDark,
    c,
    fonts,
    // Modern card: no outline, soft shadow, generous corners.
    card: {
      backgroundColor: c.surface,
      borderRadius: radius.l,
      ...softShadow(isDark),
    },
  };
}
