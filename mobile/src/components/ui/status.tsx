import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { SecondaryButton } from './actions';
import { colors, radii, spacing, typography } from '@/lib/theme';

export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'warning' | 'error' | 'info' | 'ai' }) {
  const toneStyle = badgeTones[tone];
  return <View accessibilityLabel={`Status: ${label}`} style={[styles.badge, { backgroundColor: toneStyle.background }]}><Text style={[styles.badgeText, { color: toneStyle.foreground }]}>{label}</Text></View>;
}

export function LoadingState({ label = 'Checking CropTwin service' }: { label?: string }) {
  return <View accessible accessibilityRole="progressbar" accessibilityLabel={label} style={styles.state}><ActivityIndicator color={colors.agronomy} /><Text style={styles.stateTitle}>{label}</Text><Text style={styles.stateBody}>Retrieving authoritative data.</Text></View>;
}

export function EmptyState({ title = 'Nothing here yet', description = 'No authoritative records are available for this view.' }: { title?: string; description?: string }) {
  return <View accessible accessibilityLabel={title} style={styles.state}><Text style={styles.stateTitle}>{title}</Text><Text style={styles.stateBody}>{description}</Text></View>;
}

export function ErrorState({ title = 'Request could not be completed', description, onRetry, technicalDetails }: { title?: string; description: string; onRetry?: () => void; technicalDetails?: unknown }) {
  return <View accessible accessibilityRole="alert" accessibilityLabel={title} style={[styles.state, styles.error]}><Text style={styles.stateTitle}>{title}</Text><Text style={styles.stateBody}>{description}</Text>{onRetry ? <SecondaryButton onPress={onRetry}>Retry</SecondaryButton> : null}{technicalDetails !== undefined ? <TechnicalDetails details={technicalDetails} /> : null}</View>;
}

export function OfflineState({ onRetry }: { onRetry?: () => void }) {
  return <ErrorState title="Service unavailable" description="CropTwin cannot reach the configured FastAPI service. Your device may be offline or the service may be stopped." onRetry={onRetry} />;
}

export function TechnicalDetails({ details }: { details: unknown }) {
  const [expanded, setExpanded] = useState(false);
  return <View><Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} hitSlop={8}><Text style={styles.detailsToggle}>{expanded ? 'Hide technical details' : 'Show technical details'}</Text></Pressable>{expanded ? <Text selectable style={styles.details}>{typeof details === 'string' ? details : JSON.stringify(details, null, 2)}</Text> : null}</View>;
}

const badgeTones = {
  neutral: { background: '#EDF0EC', foreground: colors.textSecondary }, success: { background: '#E2F2E7', foreground: colors.success },
  warning: { background: '#FAEEDB', foreground: colors.warning }, error: { background: '#F9E4E4', foreground: colors.destructive },
  info: { background: '#E3EFF6', foreground: colors.information }, ai: { background: colors.aiEvidenceSoft, foreground: colors.aiEvidence },
};
const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', minHeight: 28, justifyContent: 'center', borderRadius: radii.pill, paddingHorizontal: spacing.md },
  badgeText: { ...typography.label },
  state: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surfaceElevated, padding: spacing.lg, gap: spacing.sm },
  error: { borderLeftColor: colors.destructive, borderLeftWidth: 4 },
  stateTitle: { ...typography.heading, color: colors.textPrimary }, stateBody: { ...typography.body, color: colors.textSecondary },
  detailsToggle: { ...typography.label, color: colors.information, paddingVertical: spacing.sm },
  details: { ...typography.caption, color: colors.textSecondary, backgroundColor: colors.background, borderRadius: radii.sm, padding: spacing.md },
});
