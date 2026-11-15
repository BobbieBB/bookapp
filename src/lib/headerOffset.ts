import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Height of the native back-chevron header on pushed screens (status bar + iOS's 44pt bar).
// KeyboardAvoidingView measures itself from below that header, so it needs this as its offset,
// otherwise the keyboard still covers the bottom of the screen.
export function useHeaderOffset(): number {
  const insets = useSafeAreaInsets();
  return insets.top + 44;
}
