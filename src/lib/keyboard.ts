// Android draws the app under the keyboard (edge to edge, Android 15+), so the screen no longer shrinks when
// the keyboard opens and a field low on the screen ends up behind it (first tester's report, 27 Nov 2026: the
// password field on sign-in). iOS is handled by KeyboardAvoidingView / automaticallyAdjustKeyboardInsets.
//
// useKeyboardSpace(ref of the scroll view) gives a scroll view room under its content as tall as the keyboard, and scrolls the field
// being typed in up above the keyboard: when the keyboard opens, and when the reader moves to another field.
import { useEffect, useRef, useState, type ComponentRef, type RefObject } from 'react';
import { Keyboard, Platform, ScrollView, TextInput, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

/** Space kept between the field and the top of the keyboard. */
const MARGIN = 24;

const focusListeners = new Set<() => void>();

/** Called by Field when it gains focus, so the screen can bring it into view while the keyboard is open. */
export function fieldFocused() {
  if (Platform.OS !== 'android') return;
  for (const listener of focusListeners) listener();
}

export function useKeyboardSpace(ref: RefObject<ComponentRef<typeof ScrollView> | null>) {
  const offset = useRef(0);
  const keyboardTop = useRef<number | null>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const reveal = () => {
      // After the space under the content is laid out and focus has settled.
      setTimeout(() => {
        const top = keyboardTop.current;
        const input = TextInput.State.currentlyFocusedInput();
        if (top === null || !input) return;
        input.measureInWindow((_x, y, _w, h) => {
          const overlap = y + h + MARGIN - top;
          if (overlap > 0) ref.current?.scrollTo({ y: offset.current + overlap, animated: true });
        });
      }, 80);
    };
    const shown = Keyboard.addListener('keyboardDidShow', (e) => {
      keyboardTop.current = e.endCoordinates.screenY;
      setHeight(e.endCoordinates.height);
      reveal();
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTop.current = null;
      setHeight(0);
    });
    focusListeners.add(reveal);
    return () => {
      shown.remove();
      hidden.remove();
      focusListeners.delete(reveal);
    };
  }, []);

  return {
    /** Extra space for the end of the scroll view's content: the keyboard's height on Android, else 0. */
    bottom: height,
    /** For the scroll view: keeps track of how far it is scrolled. */
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      offset.current = e.nativeEvent.contentOffset.y;
    },
  };
}
