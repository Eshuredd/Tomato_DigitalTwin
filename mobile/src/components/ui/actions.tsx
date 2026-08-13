import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, type PressableProps } from 'react-native';

import { colors, radii, spacing, typography } from '@/lib/theme';

type ButtonProps = PropsWithChildren<PressableProps>;

function AppButton({ children, disabled, style, variant, ...props }: ButtonProps & { variant: 'primary' | 'secondary' }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      {...props}
      style={(state) => [styles.base, variant === 'primary' ? styles.primary : styles.secondary, state.pressed && styles.pressed, disabled && styles.disabled, typeof style === 'function' ? style(state) : style]}
    >
      <Text style={variant === 'primary' ? styles.primaryText : styles.secondaryText}>{children}</Text>
    </Pressable>
  );
}

export function PrimaryButton(props: ButtonProps) { return <AppButton {...props} variant="primary" />; }
export function SecondaryButton(props: ButtonProps) { return <AppButton {...props} variant="secondary" />; }

const styles = StyleSheet.create({
  base: { minHeight: 48, paddingHorizontal: spacing.lg, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  primary: { backgroundColor: colors.agronomy, borderColor: colors.agronomy },
  secondary: { backgroundColor: colors.surface, borderColor: colors.agronomy },
  primaryText: { ...typography.body, fontWeight: '700', color: colors.white },
  secondaryText: { ...typography.body, fontWeight: '700', color: colors.agronomy },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.45 },
});
