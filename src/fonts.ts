// Every font the app uses, loaded once at start-up (app/_layout.tsx). The theme refers to these by
// name (src/theme.ts); a test checks that each name it uses is loaded here.
import { CormorantGaramond_700Bold_Italic } from '@expo-google-fonts/cormorant-garamond';
import { SofiaSans_400Regular, SofiaSans_700Bold, SofiaSans_800ExtraBold } from '@expo-google-fonts/sofia-sans';

export const FONT_FILES = {
  CormorantGaramond_700Bold_Italic,
  SofiaSans_400Regular,
  SofiaSans_700Bold,
  SofiaSans_800ExtraBold,
};
