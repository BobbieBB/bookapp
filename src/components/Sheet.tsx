import Feather from '@expo/vector-icons/Feather';
import { useEffect, useRef, type ComponentRef, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { T } from '@/components/ui';
import { radius, space, useTheme } from '@/theme';

/** A sheet that slides up from the bottom; tapping outside it closes it, like the push offer. */
export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const { c, card } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityRole="none" style={{ flex: 1, backgroundColor: c.scrim }} onPress={onClose} />
      <View
        style={{
          ...card,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          borderTopLeftRadius: radius.l,
          borderTopRightRadius: radius.l,
          padding: space.xl,
          paddingBottom: space.xl + insets.bottom,
          gap: space.l,
        }}
      >
        <T v="h2">{title}</T>
        {children}
      </View>
    </Modal>
  );
}

const ROW = 44;
const VISIBLE = 5; // rows on screen; the middle one is the choice

/**
 * A scrolling wheel of whole numbers from `min` to `max`, like the iOS date picker: the row in the
 * middle band is the value. Every row can also be tapped (and is a button for screen readers).
 */
export function NumberWheel({
  min,
  max,
  value,
  onChange,
  label,
  testIDPrefix,
}: {
  min: number;
  max: number;
  value: number;
  onChange: (n: number) => void;
  label: (n: number) => string;
  testIDPrefix: string;
}) {
  const { c, fonts } = useTheme();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const count = Math.max(0, max - min + 1);
  const index = Math.min(Math.max(value - min, 0), Math.max(count - 1, 0));
  const pad = ((VISIBLE - 1) / 2) * ROW;

  // Opened on the current value; a tap on another row glides there.
  useEffect(() => {
    scroll.current?.scrollTo({ y: index * ROW, animated: true });
  }, [index]);

  const settle = (y: number) => {
    const n = min + Math.min(Math.max(Math.round(y / ROW), 0), count - 1);
    if (n !== value) onChange(n);
  };

  return (
    <View style={{ height: ROW * VISIBLE }}>
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: pad, height: ROW, borderRadius: radius.s, backgroundColor: c.band }} />
      <ScrollView
        ref={scroll}
        showsVerticalScrollIndicator={false}
        snapToInterval={ROW}
        decelerationRate="fast"
        contentOffset={{ x: 0, y: index * ROW }}
        contentContainerStyle={{ paddingVertical: pad }}
        onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(e) => {
          // A drag that stops dead has no momentum phase.
          if (!e.nativeEvent.velocity?.y) settle(e.nativeEvent.contentOffset.y);
        }}
      >
        {Array.from({ length: count }, (_, i) => {
          const n = min + i;
          const selected = n === value;
          return (
            <Pressable
              key={n}
              testID={`${testIDPrefix}-${n}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={label(n)}
              onPress={() => onChange(n)}
              style={{ height: ROW, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontFamily: selected ? fonts.bodyBold : fonts.body, fontSize: selected ? 20 : 17, color: selected ? c.ink : c.muted }}>
                {label(n)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** A list of choices in a sheet, the chosen one ticked. */
export function ChoiceList<V extends string>({
  options,
  value,
  onPick,
}: {
  options: { value: V; label: string }[];
  value: V;
  onPick: (v: V) => void;
}) {
  const { c, fonts } = useTheme();
  return (
    <View>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityLabel={o.label}
            accessibilityState={{ selected }}
            onPress={() => onPick(o.value)}
            style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: c.hairline }}
          >
            <Text style={{ fontFamily: selected ? fonts.bodyBold : fonts.body, fontSize: 17, color: c.ink }}>{o.label}</Text>
            {selected ? <Feather name="check" size={20} color={c.ink} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
