import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { radius, softShadow, space, useTheme } from '@/theme';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'link';
  disabled?: boolean;
  loading?: boolean;
}) {
  const { c, isDark, fonts } = useTheme();
  const base: ViewStyle = { minHeight: 52, borderRadius: radius.s, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.l };
  const style: ViewStyle =
    variant === 'primary'
      ? { ...base, backgroundColor: c.primary, shadowColor: c.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: isDark ? 0.25 : 0.35, shadowRadius: 14, elevation: 3 }
      : variant === 'secondary'
        ? { ...base, backgroundColor: c.surface, ...softShadow(isDark, 'small') }
        : { minHeight: 44, alignItems: 'center', justifyContent: 'center' };
  const textColor = variant === 'primary' ? c.onPrimary : c.ink;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [style, (pressed || disabled) && { opacity: 0.75, transform: [{ scale: 0.98 }] }]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text
          style={{
            color: textColor,
            fontSize: 16,
            fontFamily: fonts.bodyBold,
            textDecorationLine: variant === 'link' ? 'underline' : 'none',
          }}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const { c, fonts } = useTheme();
  return (
    <View style={{ gap: space.xs }}>
      <Text style={{ fontSize: 15, fontFamily: fonts.bodyBold, color: c.inkSoft }}>{label}</Text>
      <TextInput
        placeholderTextColor={c.muted}
        accessibilityLabel={label}
        style={{
          height: 50,
          borderRadius: radius.s,
          borderWidth: 1.5,
          borderColor: c.hairline,
          backgroundColor: c.surface,
          paddingHorizontal: space.m,
          fontSize: 16,
          fontFamily: fonts.body,
          color: c.ink,
        }}
        {...props}
      />
    </View>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const { c, fonts } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
      <Text style={{ fontSize: 16, fontFamily: fonts.body, color: c.ink }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: c.secondary, false: c.track }} accessibilityLabel={label} />
    </View>
  );
}

export function Card({ children, tone = 'surface', style }: { children: ReactNode; tone?: 'surface' | 'mine' | 'band'; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View style={[t.card, { padding: space.l, gap: space.s, backgroundColor: t.c[tone] }, style]}>{children}</View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  const { c, fonts } = useTheme();
  if (!children) return null;
  return <Text style={{ color: c.danger, fontSize: 15, lineHeight: 21, fontFamily: fonts.bodyBold }}>{children}</Text>;
}

/** Text in one of the design-system roles. */
export function T({
  v = 'body',
  children,
  style,
  numberOfLines,
}: {
  v?: 'h1' | 'h2' | 'moment' | 'body' | 'muted' | 'overline' | 'label';
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const { c, fonts } = useTheme();
  const styles: Record<string, TextStyle> = {
    h1: { fontFamily: fonts.display, fontSize: 32, letterSpacing: -0.8, color: c.ink },
    h2: { fontFamily: fonts.display, fontSize: 19, letterSpacing: -0.3, color: c.ink },
    moment: { fontFamily: fonts.moment, fontSize: 28, color: c.ink },
    body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: c.inkSoft },
    muted: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: c.muted },
    overline: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1.2, color: c.muted },
    label: { fontFamily: fonts.bodyBold, fontSize: 15, color: c.ink },
  };
  return (
    <Text style={[styles[v], style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

export function Chip({ label, active, onPress, big }: { label: string; active: boolean; onPress: () => void; big?: boolean }) {
  const { c, isDark, fonts } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        minHeight: 44,
        paddingHorizontal: big ? 18 : 14,
        borderRadius: radius.pill,
        justifyContent: 'center',
        backgroundColor: active ? c.primary : c.surface,
        ...(active ? {} : softShadow(isDark, 'small')),
      }}
    >
      <Text style={{ fontSize: big ? 16 : 14, fontFamily: active ? fonts.bodyBold : fonts.body, color: active ? c.onPrimary : c.inkSoft }}>
        {label}
      </Text>
    </Pressable>
  );
}
