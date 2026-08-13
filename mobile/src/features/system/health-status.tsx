import { StyleSheet, Text, View } from 'react-native';

import { Divider, ErrorState, LoadingState, MetricRow, SectionCard, StatusBadge, TechnicalDetails } from '@/components/ui';
import type { Health } from '@/lib/api/contracts';
import { toUserFacingError } from '@/lib/api/errors';
import { colors, spacing, typography } from '@/lib/theme';
import { useHealth } from './use-health';

export function BackendStatusCard() { return <BackendStatusView query={useHealth()} />; }

type HealthQueryView = { data?: Health; error: unknown; isPending: boolean; isFetching: boolean; refetch: () => unknown };

export function BackendStatusView({ query }: { query: HealthQueryView }) {
  if (query.isPending) return <SectionCard title="Backend connection"><LoadingState /></SectionCard>;
  if (query.error) {
    const friendly = toUserFacingError(query.error);
    return <SectionCard title="Backend connection"><ErrorState title={friendly.title} description={friendly.description} onRetry={() => void query.refetch()} technicalDetails={friendly.technicalDetails} /></SectionCard>;
  }
  return (
    <SectionCard title="Backend connection" accent="agronomy">
      <View style={styles.statusLine}><StatusBadge label={query.isFetching ? 'Refreshing' : 'Connected'} tone="success" /><Text style={styles.support}>FastAPI is responding</Text></View>
      <Divider />
      <MetricRow label="Service" value="CropTwin FastAPI" />
      <MetricRow label="API version" value={query.data?.version ?? 'Unknown'} />
      <TechnicalDetails details={query.data} />
    </SectionCard>
  );
}

const styles = StyleSheet.create({ statusLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' }, support: { ...typography.label, color: colors.textSecondary } });
