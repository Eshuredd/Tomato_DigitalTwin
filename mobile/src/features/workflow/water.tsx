import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { EmptyState, ErrorState, MetricRow, PrimaryButton, SecondaryButton, SectionCard, StatusBadge, TechnicalDetails } from '@/components/ui';
import { CropTwinApiError, toUserFacingError, type WaterStateResponse } from '@/lib/api';
import type { ReviewedIrrigation, ReviewedWeather } from './drafts';
import { useComputeWaterState } from './hooks';
import { buildComputeWaterRequest, buildWaterSemanticPayload, canonicalJson, waterBaseline, type WorkflowRequestIdentityStore } from './requests';

export function WaterWorkflow({ stateId, weather, irrigation, current, identities }: { stateId: string; weather: ReviewedWeather; irrigation: ReviewedIrrigation; current?: WaterStateResponse; identities: WorkflowRequestIdentityStore }) {
  const mutation = useComputeWaterState(stateId); const [error, setError] = useState<unknown>(); const [rebased, setRebased] = useState(false); const controller = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => controller.current?.abort(), []);
  async function submit() {
    if (mutation.isPending) return;
    try {
      const baseline = rebased ? undefined : waterBaseline(current); const semantic = buildWaterSemanticPayload(stateId, weather, irrigation, baseline); const signature = canonicalJson(semantic); const waterUpdateId = identities.waterId(signature); const input = buildComputeWaterRequest(stateId, weather, irrigation, waterUpdateId, baseline);
      controller.current = new AbortController(); setError(undefined);
      await mutation.mutateAsync({ input, signal: controller.current.signal }); setRebased(false);
    } catch (cause) { if (!(cause instanceof CropTwinApiError && cause.kind === 'cancelled')) { setError(cause); if (cause instanceof CropTwinApiError && cause.code === 'WATER_UPDATE_CONFLICT') identities.clearWater(); } }
  }
  function rebase() { identities.clearWater(); setRebased(true); setError(undefined); }
  const friendly = error ? toUserFacingError(error) : undefined; const stale = error instanceof CropTwinApiError && error.code === 'STALE_WATER_BASELINE';
  return <SectionCard title="Deterministic water state" accent="agronomy"><Text>FastAPI computes the agronomy. The accepted weather date is sent as current_date and observed_at is omitted.</Text><MetricRow label="Current date" value={weather.targetDate} /><MetricRow label="Irrigation" value={irrigation.distinction.replaceAll('_', ' ')} /><MetricRow label="Baseline" value={rebased || !current ? 'Server-resolved' : `Sequence ${current.water_sequence}`} /><PrimaryButton disabled={mutation.isPending} onPress={() => void submit()}>{mutation.isPending ? 'Computing water state…' : current ? 'Compute changed water state' : 'Compute first water state'}</PrimaryButton>{friendly ? <ErrorState title="Water computation unavailable" description={friendly.description} technicalDetails={friendly.technicalDetails} /> : null}{stale ? <SecondaryButton accessibilityLabel="Rebase water request" onPress={rebase}>Rebase water request</SecondaryButton> : null}{current ? <WaterResult result={current} /> : <EmptyState title="No deterministic water result" description="Accept weather and irrigation, then submit one authoritative computation." />}</SectionCard>;
}

export function WaterResult({ result }: { result: WaterStateResponse }) {
  return <SectionCard title="Authoritative water result" accent="agronomy"><StatusBadge label="Deterministic backend result" tone="success" /><MetricRow label="Moisture state" value={result.estimated_moisture_state.replaceAll('_', ' ')} /><MetricRow label="Stress band" value={result.stress_band} /><MetricRow label="Root-zone depletion" value={`${result.root_zone_depletion_mm.toFixed(2)} mm`} /><MetricRow label="RAW threshold" value={`${result.raw_threshold.toFixed(2)} mm`} /><MetricRow label="Effective irrigation" value={`${result.effective_irrigation_mm.toFixed(2)} mm`} /><MetricRow label="Water sequence" value={result.water_sequence} /><TechnicalDetails details={{ water_observation_id: result.water_observation_id, water_sequence: result.water_sequence, base_water_observation_id: result.base_water_observation_id, base_water_sequence: result.base_water_sequence, water_update_id: result.water_update_id, growth_stage: result.growth_stage, eto_computed: result.eto_computed, eto_method: result.eto_method, kc: result.kc, etc: result.etc, taw: result.taw, raw_threshold: result.raw_threshold, water_surplus_mm: result.water_surplus_mm, depletion_beyond_taw_mm: result.depletion_beyond_taw_mm, reported_irrigation_event_id: result.reported_irrigation_event_id, applied_irrigation_event_id: result.applied_irrigation_event_id, irrigation_event_already_accounted_for: result.irrigation_event_already_accounted_for, observed_at: result.observed_at, computed_at: result.computed_at, observation_time_basis: result.observation_time_basis }} /></SectionCard>;
}
