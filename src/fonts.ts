// Every font the app uses, loaded once at start-up (app/_layout.tsx). The theme refers to these by
// name (src/theme.ts); a test checks that each name it uses is loaded here.
import {
  AtkinsonHyperlegible_400Regular,
  AtkinsonHyperlegible_700Bold,
} from '@expo-google-fonts/atkinson-hyperlegible';
import {
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
import { CormorantGaramond_700Bold_Italic } from '@expo-google-fonts/cormorant-garamond';
import { Onest_400Regular, Onest_600SemiBold, Onest_700Bold, Onest_800ExtraBold } from '@expo-google-fonts/onest';

export const FONT_FILES = {
  AtkinsonHyperlegible_400Regular,
  AtkinsonHyperlegible_700Bold,
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_800ExtraBold,
  CormorantGaramond_700Bold_Italic,
  Onest_400Regular,
  Onest_600SemiBold,
  Onest_700Bold,
  Onest_800ExtraBold,
};
