import {
  AtkinsonHyperlegible_400Regular,
  AtkinsonHyperlegible_700Bold,
} from '@expo-google-fonts/atkinson-hyperlegible';
import {
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
import { CormorantGaramond_700Bold_Italic } from '@expo-google-fonts/cormorant-garamond';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/lib/auth';
import { useTheme } from '@/theme';

function Loading() {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.ground }}>
      <ActivityIndicator color={c.primary} />
    </View>
  );
}

function RootStack() {
  const { loading, session, profile } = useAuth();
  const { c } = useTheme();
  if (loading) return <Loading />;

  const signedIn = !!session;
  const onboarded = signedIn && !!profile;

  // Each screen is only reachable in the right state: signed out → sign-in,
  // signed in without a profile → onboarding, otherwise → the app.
  return (
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
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const { isDark } = useTheme();
  const [fontsLoaded] = useFonts({
    AtkinsonHyperlegible_400Regular,
    AtkinsonHyperlegible_700Bold,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_800ExtraBold,
    CormorantGaramond_700Bold_Italic,
  });

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        {fontsLoaded ? <RootStack /> : <Loading />}
      </AuthProvider>
    </SafeAreaProvider>
  );
}
