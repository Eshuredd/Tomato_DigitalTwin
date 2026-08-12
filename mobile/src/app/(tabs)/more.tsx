import { StyleSheet, Text } from 'react-native';

import { API_BASE_URL } from '@/lib/api/config';
import { AppHeader, AppScreen, Divider, FieldLabel, SectionCard, StatusBadge, TechnicalDetails } from '@/components/ui';
import { BackendStatusCard } from '@/features/system/health-status';
import { colors, typography } from '@/lib/theme';

export default function MoreScreen() {
  return (
    <AppScreen testID="screen-more">
      <AppHeader eyebrow="Settings and records" title="More" description="Connection details and future record areas live here without crowding daily workflow navigation." />
      <BackendStatusCard />
      <SectionCard title="System information"><FieldLabel>Configured API base URL</FieldLabel><Text selectable style={styles.value}>{API_BASE_URL}</Text><Divider /><TechnicalDetails details={{ apiBaseUrl: API_BASE_URL, transport: 'Direct FastAPI fetch', publicConfigurationContainsSecrets: false }} /></SectionCard>
      <SectionCard title="Records"><StatusBadge label="Not available yet" tone="info" /><Text style={styles.body}>History and actual-action records will appear here when those mobile workflows are implemented.</Text></SectionCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({ value: { ...typography.body, color: colors.textPrimary }, body: { ...typography.body, color: colors.textSecondary } });
