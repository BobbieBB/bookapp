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
          borderWidth: checked ? 0 : 1.5,
          borderColor: c.hairline,
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

function WebLink({ title, url, onFail }: { title: string; url: string; onFail: () => void }) {
  const { c, fonts } = useTheme();
  return (
    <Pressable accessibilityRole="link" onPress={() => Linking.openURL(url).catch(onFail)} style={{ minHeight: 44, justifyContent: 'center' }}>
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
  const failed = () => setLinkFailed(true);
  return (
    <View style={{ gap: space.xs }}>
      <Checkbox label={t('legal.acceptTerms')} checked={terms} onChange={onTerms} disabled={disabled} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.l, paddingLeft: 26 + space.m }}>
        <WebLink title={t('legal.terms')} url={TERMS_URL} onFail={failed} />
        <WebLink title={t('legal.privacy')} url={PRIVACY_URL} onFail={failed} />
      </View>
      <ErrorText>{linkFailed ? t('legal.linkFailed') : null}</ErrorText>
      <Checkbox label={t('legal.age', { age: MIN_AGE })} checked={age} onChange={onAge} disabled={disabled} />
      <View style={{ paddingLeft: 26 + space.m }}>
        <T v="muted">{t('legal.ageNote', { age: MIN_AGE })}</T>
      </View>
    </View>
  );
}
