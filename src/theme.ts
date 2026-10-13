// Ink & Bloom design tokens (chosen 14 Oct 2026).
// Light = "Fresh Ink", dark = "Midnight Bloom". Same roles, two lightings:
// components ask for a role (e.g. `c.mine` for your own posts), never a hex.
import { useColorScheme } from 'react-native';

const light = {
  ground: '#F4F9F6', // mint paper
  surface: '#FFFFFF',
  band: '#BFEBD8', // header band
  ink: '#1E1328', // text and outlines
  inkSoft: '#3B2F45',
  muted: '#4E4459',
  outline: '#1E1328',
  hairline: '#C9C0D2',
  shadow: '#1E1328', // hard offset shadow
  primary: '#FF4F84', // hot pink
  onPrimary: '#1E1328',
  secondary: '#3DBE95', // fresh mint
  onSecondary: '#1E1328',
  mine: '#FFE3EC', // your own posts
  safe: '#3DBE95', // spoiler-safe banner
  onSafe: '#1E1328',
  danger: '#B3123F',
  success: '#1F6B45',
  track: '#E6E0EC',
};

const dark: typeof light = {
  ground: '#160E1C',
  surface: '#22172B',
  band: '#13302A',
  ink: '#F7EEF3',
  inkSoft: '#EDE2EA',
  muted: '#BBAAC2',
  outline: '#4A3557',
  hairline: '#4A3557',
  shadow: '#3A1D2C',
  primary: '#FF8FB1', // neon rose
  onPrimary: '#1E1328',
  secondary: '#8EE6CC', // electric mint
  onSecondary: '#0F2A23',
  mine: '#3A1D2C',
  safe: '#8EE6CC',
  onSafe: '#0F2A23',
  danger: '#FF7A93',
  success: '#8EE6CC',
  track: '#33263D',
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
  { bg: '#FF8FB1', fg: '#1E1328' },
  { bg: '#8EE6CC', fg: '#0F2A23' },
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

// Font family names as registered in app/_layout.tsx.
export const fonts = {
  display: 'BricolageGrotesque_800ExtraBold', // UI headings
  displaySemi: 'BricolageGrotesque_600SemiBold',
  moment: 'CormorantGaramond_700Bold_Italic', // emotional moments: The Epilogue, chapter titles
  body: 'AtkinsonHyperlegible_400Regular', // reading text
  bodyBold: 'AtkinsonHyperlegible_700Bold',
};

export const radius = { s: 10, m: 14, l: 16, pill: 999 };
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 };

export function useTheme() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const c = isDark ? dark : light;
  return {
    isDark,
    c,
    // The signature "sticker" look: outline + hard offset shadow (lighter in dark mode).
    card: {
      backgroundColor: c.surface,
      borderWidth: 2,
      borderColor: c.outline,
      borderRadius: radius.m,
      shadowColor: c.shadow,
      shadowOffset: { width: 4, height: 4 },
      shadowOpacity: 1,
      shadowRadius: 0,
      elevation: 0,
    },
  };
}
