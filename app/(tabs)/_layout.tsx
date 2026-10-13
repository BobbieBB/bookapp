import { Tabs } from 'expo-router';

import { fonts, useTheme } from '@/theme';

export default function TabsLayout() {
  const { c } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.ink,
        tabBarInactiveTintColor: c.muted,
        tabBarActiveBackgroundColor: c.mine,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.outline, borderTopWidth: 2 },
        tabBarLabelStyle: { fontSize: 13, fontFamily: fonts.bodyBold },
        tabBarIconStyle: { display: 'none' }, // icons come with the next design pass
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="library" options={{ title: 'Library' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
