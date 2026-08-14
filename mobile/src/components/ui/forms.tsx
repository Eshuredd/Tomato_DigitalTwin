import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, radii, spacing, typography } from '@/lib/theme';

export function FormScreen({ children }: PropsWithChildren) { return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>{children}</KeyboardAvoidingView>; }
export function FormField({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} accessibilityHint={error} style={[styles.input, error && styles.invalid]} placeholderTextColor={colors.textSecondary} autoCapitalize="none" {...props} />{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}</View>;
}
export function ChoiceField({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><View style={styles.choices}>{options.map((option) => <Text key={option} accessibilityRole="button" accessibilityState={{ selected: value === option }} onPress={() => onChange(option)} style={[styles.choice, value === option && styles.choiceSelected]}>{option.replaceAll('_', ' ')}</Text>)}</View></View>;
}
const styles = StyleSheet.create({
  flex: { flex: 1 }, field: { gap: spacing.sm }, label: { ...typography.label, color: colors.textPrimary },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface, color: colors.textPrimary, paddingHorizontal: spacing.md, ...typography.body },
  invalid: { borderColor: colors.destructive }, error: { ...typography.caption, color: colors.destructive }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: { ...typography.label, minHeight: 42, textAlignVertical: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, color: colors.textSecondary, backgroundColor: colors.surface },
  choiceSelected: { borderColor: colors.agronomy, color: colors.agronomy, backgroundColor: colors.agronomySoft },
});
