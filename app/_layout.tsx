import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppearanceProvider } from '@/appearance';
import { PushEffects } from '@/components/PushEffects';
import { Button, T } from '@/components/ui';
import { FONT_FILES } from '@/fonts';
import { LanguageProvider, useT } from '@/i18n';
import { track } from '@/lib/analytics';
import { AuthProvider, useAuth } from '@/lib/auth';
import { termsStatus } from '@/lib/legal';
import { showForegroundPushesQuietly } from '@/lib/pushDevice';
import { space, useTheme } from '@/theme';

showForegroundPushesQuietly();

function Loading() {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.ground }}>
      <ActivityIndicator color={c.signal} />
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

export function RootStack() {
  const { loading, session, profile, profileState, recovering } = useAuth();
  const { c } = useTheme();
  // A password reset signs the reader in before it sets the new password: stay on the
  // signed-out screens until it is done (src/lib/auth.tsx, `recovering`).
  const signedIn = !!session && !recovering;
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
  const hasProfile = signedIn && !!profile;
  // Readers who accepted no terms, or an older version once it has taken effect, accept the current one
  // first. Before it takes effect, Home tells them it is coming (src/components/TermsChangeNotice.tsx).
  const terms = hasProfile ? termsStatus(profile.terms_version) : null;
  const onboarded = hasProfile && terms !== 'required';

  const pushed = {
    headerShown: true,
    title: '',
    headerBackButtonDisplayMode: 'minimal' as const,
    headerShadowVisible: false,
    headerStyle: { backgroundColor: c.ground },
    headerTintColor: c.ink,
  };
  // Each screen is only reachable in the right state: signed out → sign-in, signed in without a
  // profile → onboarding, a profile without the current terms → accept-terms, otherwise → the app.
  // Deleting the account stays open to readers who would rather leave than accept.
  return (
    <>
      {onboarded && <PushEffects />}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.ground } }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="reset-password" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !hasProfile}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        {/* Also open before a change takes effect, for readers who accept early from Home's notice. */}
        <Stack.Protected guard={hasProfile && terms !== 'current'}>
          <Stack.Screen name="accept-terms" />
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
          <Stack.Screen name="admin" />
          <Stack.Screen name="moderation" />
        </Stack.Protected>
        <Stack.Protected guard={hasProfile}>
          <Stack.Screen name="delete-account" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts(FONT_FILES);

  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <AppearanceProvider>
          <AuthProvider>
            <ThemedStatusBar />
            {fontsLoaded ? <RootStack /> : <Loading />}
          </AuthProvider>
        </AppearanceProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
