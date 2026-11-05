import Feather from '@expo/vector-icons/Feather';
import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { ErrorText, T } from '@/components/ui';
import { useT } from '@/i18n';
import { MIN_AGE, PRIVACY_URL, TERMS_URL } from '@/lib/legal';
import { radius, space, useTheme } from '@/theme';

function Checkbox({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const { c, fonts } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled: !!disabled }}
      onPress={() => onChange(!checked)}
      disabled={disabled}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: 44 }}
    >
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: radius.s / 2,
          borderWidth: checked ? 0 : 2,
          // muted, not hairline: an unticked box needs 3:1 contrast against the card in light and dark.
          borderColor: c.muted,
          backgroundColor: checked ? c.primary : c.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? <Feather name="check" size={18} color={c.onPrimary} /> : null}
      </View>
      {/* The label wraps (Bulgarian labels are long); the box keeps its size. */}
      <Text style={{ flex: 1, fontSize: 16, fontFamily: fonts.body, color: c.ink }}>{label}</Text>
    </Pressable>
  );
}

function WebLink({ title, label, url, onOpened }: { title: string; label: string; url: string; onOpened: (ok: boolean) => void }) {
  const { c, fonts } = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={() => Linking.openURL(url).then(() => onOpened(true), () => onOpened(false))}
      style={{ minHeight: 44, minWidth: 44, justifyContent: 'center' }}
    >
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.ink, textDecorationLine: 'underline' }}>{title}</Text>
    </Pressable>
  );
}

/**
 * The two ticks before the app opens (docs/DECISIONS.md, "Terms and age: ticked at sign-up"): the terms
 * and privacy policy, which live on the web, and "I'm at least {MIN_AGE}". Only yes or no is kept.
 */
export function TermsConsent({
  terms,
  age,
  onTerms,
  onAge,
  disabled,
}: {
  terms: boolean;
  age: boolean;
  onTerms: (v: boolean) => void;
  onAge: (v: boolean) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const [linkFailed, setLinkFailed] = useState(false);
  const opened = (ok: boolean) => setLinkFailed(!ok);
  return (
    <View style={{ gap: space.xs }}>
      <Checkbox label={t('legal.acceptTerms')} checked={terms} onChange={onTerms} disabled={disabled} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.l, paddingLeft: 26 + space.m }}>
        <WebLink title={t('legal.terms')} label={t('legal.openTerms')} url={TERMS_URL} onOpened={opened} />
        <WebLink title={t('legal.privacy')} label={t('legal.openPrivacy')} url={PRIVACY_URL} onOpened={opened} />
      </View>
      <Checkbox label={t('legal.age', { age: MIN_AGE })} checked={age} onChange={onAge} disabled={disabled} />
      <View style={{ paddingLeft: 26 + space.m }}>
        <T v="muted">{t('legal.ageNote', { age: MIN_AGE })}</T>
      </View>
      {/* Last, so the boxes don't move when it shows. */}
      <ErrorText>{linkFailed ? t('legal.linkFailed') : null}</ErrorText>
    </View>
  );
}
