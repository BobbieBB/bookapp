import Feather from '@expo/vector-icons/Feather';
import { Tabs } from 'expo-router';
import { Text, View } from 'react-native';

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
        gap: 8,
        height: 44,
        paddingHorizontal: 16,
        borderRadius: 999,
        backgroundColor: c.primary,
      }}
    >
      <Feather name={name} size={20} color={c.onPrimary} />
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.onPrimary }}>{label}</Text>
    </View>
  );
}

export default function TabsLayout() {
  const { c } = useTheme();
  const t = useT();
  const tab = (label: string, icon: IconName) => ({
    title: label,
    tabBarAccessibilityLabel: label,
    tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon name={icon} label={label} focused={focused} />,
  });
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopWidth: 0,
          height: 88,
          paddingTop: 12,
          shadowColor: '#1E1328',
          shadowOffset: { width: 0, height: -1 },
          shadowOpacity: 0.06,
          shadowRadius: 0,
          elevation: 8,
        },
        tabBarIconStyle: { width: 'auto', height: 48 },
      }}
    >
      <Tabs.Screen name="index" options={tab(t('common.home'), 'home')} />
      <Tabs.Screen name="library" options={tab(t('common.library'), 'book-open')} />
      <Tabs.Screen name="discover" options={tab(t('discover.tab'), 'compass')} />
      <Tabs.Screen name="profile" options={tab(t('common.profile'), 'user')} />
    </Tabs>
  );
}
