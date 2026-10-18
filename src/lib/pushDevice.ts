// Push notifications on this phone (docs/DECISIONS.md, Spoiler Safe Mode 5): ask permission, get the
// Expo token, hand it to the database, and remember it so it can be forgotten again.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Language } from '@/i18n';

import { registerPushToken, unregisterPushToken } from './push';

export const PUSH_TOKEN_KEY = 'fictionally.pushToken';
/** A device turned off while the server couldn't be reached, still to be forgotten there. */
export const PENDING_RELEASE_KEY = 'fictionally.pushTokenPendingRelease';
/** The answer to "Want to know when someone replies?": 'yes', or when the reader said "Not now" (ms). */
export const PUSH_OFFER_KEY = 'fictionally.pushOffer';
const OFFER_PAUSE_MS = 30 * 24 * 60 * 60 * 1000;

export type PushStatus = 'enabled' | 'denied' | 'unsupported' | 'not-configured';

function phonePlatform(): 'ios' | 'android' | null {
  return Device.isDevice && (Platform.OS === 'ios' || Platform.OS === 'android') ? Platform.OS : null;
}

function easProjectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/** Turns pushes on for this phone; says why when it cannot. */
export async function enablePush(language: Language): Promise<PushStatus> {
  const platform = phonePlatform();
  if (!platform) return 'unsupported';

  // Without an EAS project there is no token to get: say so before asking the reader anything.
  const projectId = easProjectId();
  if (!projectId) return 'not-configured';

  if (platform === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Fictionally',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return 'denied';

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await registerPushToken(token, language, platform);
  await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
  return 'enabled';
}

/**
 * Whether to ask "Want to know when someone replies?" after the reader posted (docs/DECISIONS.md,
 * "Push notifications"): on a phone that can get pushes and doesn't yet, never again after "Yes",
 * not for 30 days after "Not now", and not once the phone has said no for good.
 */
export async function shouldOfferPush(now = Date.now()): Promise<boolean> {
  if (!phonePlatform() || !easProjectId() || (await pushIsOn())) return false;
  const answer = await AsyncStorage.getItem(PUSH_OFFER_KEY);
  if (answer === 'yes' || (answer !== null && now - Number(answer) < OFFER_PAUSE_MS)) return false;
  const permission = await Notifications.getPermissionsAsync();
  return permission.granted || permission.canAskAgain !== false;
}

/** "Yes" on the offer: turn pushes on (the OS asks now) and never offer again. */
export async function acceptPushOffer(language: Language): Promise<PushStatus> {
  await AsyncStorage.setItem(PUSH_OFFER_KEY, 'yes');
  return enablePush(language);
}

/** "Not now" on the offer: ask again in 30 days. */
export async function declinePushOffer(now = Date.now()): Promise<void> {
  await AsyncStorage.setItem(PUSH_OFFER_KEY, String(now));
}

/** Whether this phone has been registered (and not switched off since). */
export async function pushIsOn(): Promise<boolean> {
  return !!(await AsyncStorage.getItem(PUSH_TOKEN_KEY));
}

/** Turns pushes off: the database forgets this phone, then so does the app. */
export async function disablePush(): Promise<void> {
  const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  if (!token) return;
  // Off on this phone at once; the server is told now, or on the next start if it can't be reached.
  await AsyncStorage.multiSet([[PENDING_RELEASE_KEY, token]]);
  await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
  await releasePendingPushToken();
}

/** Tells the server to forget a device that was turned off while offline (call on every start). */
export async function releasePendingPushToken(): Promise<void> {
  const pending = await AsyncStorage.getItem(PENDING_RELEASE_KEY);
  if (!pending) return;
  await unregisterPushToken(pending);
  await AsyncStorage.removeItem(PENDING_RELEASE_KEY);
}

/** When pushes are on, tells the database the reader's language so pushes arrive in it. */
export async function syncPushLanguage(language: Language): Promise<void> {
  const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  const platform = phonePlatform();
  if (!token || !platform) return;
  await registerPushToken(token, language, platform);
}

/** A push that arrives while the app is open shows as a banner, quietly. */
export function showForegroundPushesQuietly(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}
