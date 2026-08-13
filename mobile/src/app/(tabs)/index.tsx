import { StyleSheet, Text, View } from 'react-native';

import { AppHeader, AppScreen, SectionCard, StatusBadge } from '@/components/ui';
import { BackendStatusCard } from '@/features/system/health-status';
import { colors, spacing, typography } from '@/lib/theme';

export default function HomeScreen() {
  return (
    <AppScreen testID="screen-home">
      <AppHeader eyebrow="CropTwin mobile" title="Field decisions, grounded" description="A phone-first companion for reviewing the authoritative agronomy state of a tomato crop cycle." />
      <BackendStatusCard />
      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>How evidence is presented</Text><Text style={styles.sectionBody}>CropTwin keeps computation and supporting evidence visibly separate.</Text></View>
      <SectionCard title="Deterministic agronomy" accent="agronomy"><StatusBadge label="Authoritative" tone="success" /><Text style={styles.cardBody}>Water balance, growth stage, simulation, and recommendations come from stable backend rules and stored state.</Text></SectionCard>
      <SectionCard title="AI disease evidence" accent="ai"><StatusBadge label="Supporting evidence" tone="ai" /><Text style={styles.cardBody}>Image analysis will be uncertainty-aware and will never be presented as a confirmed diagnosis.</Text></SectionCard>
      <SectionCard title="Mobile areas"><Text style={styles.cardBody}>Use the tabs to reach farms, the active cycle, the compact workflow, and system information. Areas without authoritative records remain empty.</Text></SectionCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  sectionHeader: { gap: spacing.xs, paddingTop: spacing.sm }, sectionTitle: { ...typography.title, color: colors.textPrimary },
  sectionBody: { ...typography.body, color: colors.textSecondary }, cardBody: { ...typography.body, color: colors.textSecondary },
});
