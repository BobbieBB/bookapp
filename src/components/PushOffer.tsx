// "Want to know when someone replies?" after the reader posts (docs/DECISIONS.md, "Push notifications").
// A small sheet of our own first, so a "no" never uses up the phone's one-time permission prompt.
import { useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { Button, T } from '@/components/ui';
import { useLanguage, useT } from '@/i18n';
import { acceptPushOffer, declinePushOffer, shouldOfferPush } from '@/lib/pushDevice';
import { radius, space, useTheme } from '@/theme';

/** Shows the offer when `posted` changes (one count per comment posted), if it should be offered. */
export function PushOffer({ posted }: { posted: number }) {
  const { c, card } = useTheme();
  const t = useT();
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!posted) return;
    let live = true;
    shouldOfferPush()
      .then((offer) => live && offer && setOpen(true))
      .catch(() => {
        // Unreadable storage or permissions: don't ask this time.
      });
    return () => {
      live = false;
    };
  }, [posted]);

  const answer = (save: () => Promise<unknown>) => {
    setOpen(false);
    save().catch(() => {
      // Turning pushes on can still be done from Profile.
    });
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => answer(() => declinePushOffer())}>
      <Pressable accessibilityRole="none" style={{ flex: 1, backgroundColor: c.scrim }} onPress={() => answer(() => declinePushOffer())} />
      <View style={{ ...card, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderTopLeftRadius: radius.l, padding: space.xl, gap: space.l }}>
        <T v="h2">{t('notifications.pushOffer')}</T>
        <View style={{ flexDirection: 'row', gap: space.m }}>
          <View style={{ flex: 1 }}>
            <Button variant="secondary" title={t('notifications.pushOfferLater')} onPress={() => answer(() => declinePushOffer())} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title={t('notifications.pushOfferYes')} onPress={() => answer(() => acceptPushOffer(language))} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
