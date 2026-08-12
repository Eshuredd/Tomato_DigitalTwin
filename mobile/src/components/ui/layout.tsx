import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, type ScrollViewProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radii, shadows, spacing, typography } from '@/lib/theme';

export function AppScreen({ children, contentContainerStyle, ...props }: PropsWithChildren<ScrollViewProps>) {
  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView
        {...props}
        contentContainerStyle={[styles.screenContent, contentContainerStyle]}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function AppHeader({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: string }) {
  return (
    <View style={styles.header} accessibilityRole="header">
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  );
}

export function SectionCard({ children, title, accent = 'none', style }: PropsWithChildren<{ title?: string; accent?: 'none' | 'agronomy' | 'ai'; style?: ViewStyle }>) {
  return (
    <View style={[styles.card, accent === 'agronomy' && styles.agronomyCard, accent === 'ai' && styles.aiCard, style]}>
      {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function Divider() { return <View style={styles.divider} />; }

export function FieldLabel({ children }: PropsWithChildren) { return <Text style={styles.fieldLabel}>{children}</Text>; }

export function MetricRow({ label, value, detail }: { label: string; value: ReactNode; detail?: string }) {
  return (
    <View style={styles.metricRow}>
      <View style={styles.metricCopy}><Text style={styles.metricLabel}>{label}</Text>{detail ? <Text style={styles.metricDetail}>{detail}</Text> : null}</View>
      {typeof value === 'string' || typeof value === 'number' ? <Text style={styles.metricValue}>{value}</Text> : value}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  screenContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  header: { gap: spacing.sm, paddingVertical: spacing.sm },
  eyebrow: { ...typography.label, color: colors.agronomy, textTransform: 'uppercase', letterSpacing: 1.2 },
  title: { ...typography.display, color: colors.textPrimary },
  description: { ...typography.body, color: colors.textSecondary },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.lg, padding: spacing.lg, gap: spacing.md, ...shadows.card },
  agronomyCard: { borderLeftColor: colors.agronomy, borderLeftWidth: 4 },
  aiCard: { borderLeftColor: colors.aiEvidence, borderLeftWidth: 4, backgroundColor: colors.aiEvidenceSoft },
  cardTitle: { ...typography.heading, color: colors.textPrimary },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, width: '100%' },
  fieldLabel: { ...typography.label, color: colors.textSecondary },
  metricRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg },
  metricCopy: { flex: 1, gap: spacing.xs },
  metricLabel: { ...typography.body, color: colors.textPrimary },
  metricDetail: { ...typography.caption, color: colors.textSecondary },
  metricValue: { ...typography.label, color: colors.textPrimary, textAlign: 'right', maxWidth: '48%' },
});
