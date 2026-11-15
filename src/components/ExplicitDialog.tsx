// "Explicit content": asked once, the first time a reader opens the AO3 link or a discussion room of a work
// rated Explicit (docs/DECISIONS.md, "Explicit works: an 18+ confirmation"). A sheet of our own, like the
// push offer. Continue records the yes on the account and carries on; Back changes nothing.
import { useRef, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { Button, ErrorText, T } from '@/components/ui';
import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { confirmAdult } from '@/lib/explicit';
import { radius, space, useTheme } from '@/theme';

/** `onConfirmed` runs after the yes is saved and the profile reloaded; a screen that follows the profile needs none. */
export function ExplicitDialog({ onConfirmed, onBack }: { onConfirmed?: () => void; onBack: () => void }) {
  const { c, card } = useTheme();
  const t = useT();
  const { refreshProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  // A second tap can land before `saving` re-renders the button: the ref lets only one yes through, so the
  // pending door (a link, a room) opens once.
  const inFlight = useRef(false);

  async function confirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setFailed(false);
    setSaving(true);
    try {
      await confirmAdult();
      if (!(await refreshProfile())) throw new Error('could not reload the profile');
      setSaving(false);
      onConfirmed?.();
    } catch {
      inFlight.current = false;
      setFailed(true);
      setSaving(false);
    }
  }

  const back = () => {
    if (!inFlight.current) onBack();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={back}>
      <Pressable accessibilityRole="none" style={{ flex: 1, backgroundColor: c.scrim }} onPress={back} />
      <View
        testID="explicit-dialog"
        accessibilityViewIsModal
        style={{ ...card, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderTopLeftRadius: radius.l, padding: space.xl, gap: space.l }}
      >
        <T v="h2">{t('story.explicitTitle')}</T>
        <T>{t('story.explicitBody')}</T>
        <ErrorText>{failed ? t('story.explicitFailed') : null}</ErrorText>
        <View style={{ gap: space.m }}>
          <Button title={t('story.explicitContinue')} onPress={confirm} loading={saving} />
          <Button variant="secondary" title={t('story.explicitBack')} onPress={back} disabled={saving} />
        </View>
      </View>
    </Modal>
  );
}

/**
 * For a screen with Explicit doors: `ask(needed, go)` runs `go` straight away, or, when `needed`, shows the
 * dialog first and runs `go` only after the reader's yes. Render `dialog` once in the screen.
 */
export function useExplicitGate() {
  const [pending, setPending] = useState<(() => void) | null>(null);
  const ask = (needed: boolean, go: () => void) => {
    if (needed) setPending(() => go);
    else go();
  };
  const dialog = pending ? (
    <ExplicitDialog
      onConfirmed={() => {
        setPending(null);
        pending();
      }}
      onBack={() => setPending(null)}
    />
  ) : null;
  return { ask, dialog };
}
