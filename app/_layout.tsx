import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PushEffects } from '@/components/PushEffects';
import { Button, T } from '@/components/ui';
import { FONT_FILES } from '@/fonts';
import { LanguageProvider, useT } from '@/i18n';
import { track } from '@/lib/analytics';
import { AuthProvider, useAuth } from '@/lib/auth';
import { showForegroundPushesQuietly } from '@/lib/pushDevice';
import { space, useTheme } from '@/theme';

showForegroundPushesQuietly();

function Loading() {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.ground }}>
      <ActivityIndicator color={c.primary} />
    </View>
  );
}

export function ProfileError() {
  const { c } = useTheme();
  const t = useT();
  const { refreshProfile, signOut } = useAuth();
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: space.xl, gap: space.l, backgroundColor: c.ground }}>
      <T v="h2">{t('auth.profileLoadFailed')}</T>
      <T v="muted">{t('auth.profileLoadHint')}</T>
      <Button title={t('common.tryAgain')} onPress={refreshProfile} />
      <Button variant="link" title={t('common.signOut')} onPress={signOut} />
    </View>
  );
}

function RootStack() {
  const { loading, session, profile, profileState } = useAuth();
  const { c } = useTheme();
  const signedIn = !!session;
  const opened = useRef(false);
  // Once per cold start, as soon as a signed-in session exists.
  useEffect(() => {
    if (signedIn && !opened.current) {
      opened.current = true;
      void track('app_open');
    }
  }, [signedIn]);
  if (loading) return <Loading />;

  // Wait for the profile before choosing a screen, otherwise existing readers see onboarding flash by.
  if (signedIn && !profile && profileState === 'loading') return <Loading />;
  if (signedIn && !profile && profileState === 'error') return <ProfileError />;
  const onboarded = signedIn && !!profile;

  const pushed = {
    headerShown: true,
    title: '',
    headerBackButtonDisplayMode: 'minimal' as const,
    headerShadowVisible: false,
    headerStyle: { backgroundColor: c.ground },
    headerTintColor: c.ink,
  };
  // Each screen is only reachable in the right state: signed out → sign-in,
  // signed in without a profile → onboarding, otherwise → the app.
  return (
    <>
      {onboarded && <PushEffects />}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.ground } }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !onboarded}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={onboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="add" options={{ presentation: 'modal' }} />
          {/* Pages you open from a list get the native back chevron and stay clear of the status bar. */}
          <Stack.Screen name="story/[id]" options={pushed} />
          <Stack.Screen name="finished/[id]" options={pushed} />
          <Stack.Screen name="room/[storyId]/[room]" />
          <Stack.Screen name="blocked" />
          <Stack.Screen name="feedback" />
          <Stack.Screen name="authors" />
          <Stack.Screen name="notifications" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const { isDark } = useTheme();
  const [fontsLoaded] = useFonts(FONT_FILES);

  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <AuthProvider>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          {fontsLoaded ? <RootStack /> : <Loading />}
        </AuthProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
