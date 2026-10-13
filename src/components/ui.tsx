import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { colors, radius, space } from '@/theme';

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
  const style =
    variant === 'primary' ? styles.primary : variant === 'secondary' ? styles.secondary : styles.link;
  const textStyle =
    variant === 'primary' ? styles.primaryText : variant === 'secondary' ? styles.secondaryText : styles.linkText;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [style, (pressed || disabled) && { opacity: 0.6 }]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : colors.accent} />
      ) : (
        <Text style={textStyle}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: space.xs }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        style={styles.input}
        accessibilityLabel={label}
        {...props}
      />
    </View>
  );
}

export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.accent, false: colors.line }}
        accessibilityLabel={label}
      />
    </View>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <Text style={styles.error}>{children}</Text>;
}

export const text = StyleSheet.create({
  h1: { fontSize: 28, fontWeight: '700', color: colors.ink },
  h2: { fontSize: 18, fontWeight: '700', color: colors.ink },
  body: { fontSize: 16, lineHeight: 23, color: colors.inkSoft },
  muted: { fontSize: 14, lineHeight: 20, color: colors.muted },
  overline: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: colors.muted },
});

const styles = StyleSheet.create({
  primary: {
    height: 52,
    borderRadius: radius.m,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondary: {
    height: 52,
    borderRadius: radius.m,
    borderWidth: 2,
    borderColor: '#CFC6E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: colors.accentDark, fontSize: 16, fontWeight: '700' },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { color: colors.accent, fontSize: 15, fontWeight: '700' },
  label: { fontSize: 14, fontWeight: '700', color: colors.inkSoft },
  input: {
    height: 50,
    borderRadius: radius.s,
    borderWidth: 1,
    borderColor: '#CFC6E0',
    backgroundColor: colors.surface,
    paddingHorizontal: space.m,
    fontSize: 16,
    color: colors.ink,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  toggleLabel: { fontSize: 16, color: colors.ink },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.l,
    padding: space.l,
    gap: space.s,
  },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
});
