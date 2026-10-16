import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { Pressable } from 'react-native';

import type { StoryKind } from '@/lib/types';
import { useTheme } from '@/theme';

/** The round pink "+" that opens Add a story (pre-set to books or fanfiction when known). */
export function AddButton({ kind }: { kind?: StoryKind }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add a story"
      onPress={() => router.push(kind ? { pathname: '/add', params: { kind } } : '/add')}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: c.primary,
        shadowColor: c.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
        elevation: 3,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Feather name="plus" size={22} color={c.onPrimary} />
    </Pressable>
  );
}
