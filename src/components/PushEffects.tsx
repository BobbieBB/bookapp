import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useLanguage } from '@/i18n';
import { pushTarget } from '@/lib/push';
import { syncPushLanguage } from '@/lib/pushDevice';

/** Renders nothing: while a reader is signed in, taps on pushes open the room and the language stays current. */
export function PushEffects() {
  const router = useRouter();
  const { language } = useLanguage();

  useEffect(() => {
    let live = true;
    const open = (response: Notifications.NotificationResponse) => {
      const url = pushTarget(response.notification.request.content.data);
      if (url) router.push(url as never);
    };

    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    // The tap that launched the app: handle it once, so signing out and in again does not repeat it.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!live || !response) return;
        Notifications.clearLastNotificationResponse();
        open(response);
      })
      .catch(() => {
        // No launch tap to open.
      });

    return () => {
      live = false;
      subscription.remove();
    };
  }, [router]);

  useEffect(() => {
    syncPushLanguage(language).catch(() => {
      // Offline: pushes keep the language they were registered with until the next change.
    });
  }, [language]);

  return null;
}
