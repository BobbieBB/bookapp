import Feather from '@expo/vector-icons/Feather';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '@/i18n';
import { useTheme } from '@/theme';

type IconName = 'home' | 'book-open' | 'compass' | 'user';

// Modern tab bar (design 15 Oct 2026): the active tab is a pink pill with icon + label,
// the others show only their icon (their label stays available to VoiceOver).
function TabIcon({ name, label, focused }: { name: IconName; label: string; focused: boolean }) {
  const { c, fonts } = useTheme();
  if (!focused) return <Feather name={name} size={22} color={c.muted} />;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 44,
        paddingHorizontal: 14,
        borderRadius: 999,
        backgroundColor: c.primary,
      }}
    >
      <Feather name={name} size={20} color={c.onPrimary} />
      <Text numberOfLines={1} style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.onPrimary }}>
        {label}
      </Text>
    </View>
  );
}

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

// Our own bar instead of the library's, because the library's tab items stopped honouring a wider
// active item in SDK 58 and cut the pill's label ("Li…"). The active tab takes 2.4× the room, so its
// pill (icon + label) fits, also with the longer Bulgarian labels ("Библиотека").
function PillTabBar({ state, descriptors, navigation }: TabBarProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: c.surface,
        paddingTop: 12,
        paddingBottom: Math.max(insets.bottom, 12),
        paddingHorizontal: 12,
        shadowColor: c.shadow,
        shadowOffset: { width: 0, height: -1 },
        shadowOpacity: 0.06,
        shadowRadius: 0,
        elevation: 8,
      }}
    >
      {state.routes.map((route, i) => {
        const focused = state.index === i;
        const { options } = descriptors[route.key];
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name as never, route.params as never);
        };
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            onPress={onPress}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            style={{ flex: focused ? 2.4 : 1, height: 48, alignItems: 'center', justifyContent: 'center' }}
          >
            {options.tabBarIcon?.({ focused, color: focused ? c.onPrimary : c.muted, size: 22 })}
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  const t = useT();
  const tab = (label: string, icon: IconName) => ({
    title: label,
    tabBarAccessibilityLabel: label,
    tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon name={icon} label={label} focused={focused} />,
  });
  return (
    <Tabs tabBar={(props) => <PillTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={tab(t('common.home'), 'home')} />
      <Tabs.Screen name="library" options={tab(t('common.library'), 'book-open')} />
      <Tabs.Screen name="discover" options={tab(t('discover.tab'), 'compass')} />
      <Tabs.Screen name="profile" options={tab(t('common.profile'), 'user')} />
    </Tabs>
  );
}
