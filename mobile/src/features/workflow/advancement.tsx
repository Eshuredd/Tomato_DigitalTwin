import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { EmptyState, ErrorState, MetricRow, PrimaryButton, SecondaryButton, SectionCard, StatusBadge, TechnicalDetails } from '@/components/ui';
import { CropTwinApiError, queryKeys, toUserFacingError, type AdvanceOneDayRequest, type AdvanceOneDayResponse, type UpdateTwinStateResponse, type WaterStateResponse } from '@/lib/api';
import { nextUtcCalendarDate } from '@/lib/dates/local-date';
import type { ReviewedIrrigation, ReviewedWeather } from './drafts';
import { useAdvanceOneDay } from './hooks';
import { IrrigationWorkflow } from './irrigation';
import { buildAdvancementRequest, canonicalJson, classifyAdvancement, type AdvancementTransition, type WorkflowRequestIdentityStore } from './requests';
import { TwinResult } from './twin';
import { WaterResult } from './water';
import { WeatherWorkflow } from './weather';

export interface AcceptedAdvancement { response: AdvanceOneDayResponse; transition: AdvancementTransition }

export function AdvancementWorkflow({ stateId, water, twin, identities }: { stateId: string; water: WaterStateResponse; twin: UpdateTwinStateResponse; identities: WorkflowRequestIdentityStore }) {
  const client = useQueryClient(); const mutation = useAdvanceOneDay(stateId); const [weather, setWeather] = useState<ReviewedWeather>(); const [irrigation, setIrrigation] = useState<ReviewedIrrigation>(); const [error, setError] = useState<unknown>(); const [lastRequest, setLastRequest] = useState<AdvanceOneDayRequest>(); const [accepted, setAccepted] = useState<AcceptedAdvancement>(); const controller = useRef<AbortController | undefined>(undefined);
  let requiredDate: string | undefined; try { requiredDate = nextUtcCalendarDate(water.observed_at); } catch { requiredDate = undefined; }
  useEffect(() => () => controller.current?.abort(), []);

  async function submit(exact?: AdvanceOneDayRequest) {
    if (mutation.isPending || !requiredDate) return;
    let input = exact; let signature: string | undefined;
    try {
      if (!input) { if (!weather || !irrigation) return; const semantic = { state_id: stateId, target_date: requiredDate, weather: weather.weather, last_irrigation_event: irrigation.event }; signature = canonicalJson(semantic); input = buildAdvancementRequest(stateId, requiredDate, weather, irrigation, identities.advancementId(signature)); }
      const baseSequence = water.water_sequence; controller.current = new AbortController(); setLastRequest(input); setError(undefined);
      const response = await mutation.mutateAsync({ input, signal: controller.current.signal }); const transition = classifyAdvancement(response.advancement_created, response.water_state.water_sequence, baseSequence); setAccepted({ response, transition }); client.setQueryData(queryKeys.advancement(stateId, input.advancement_id), response);
      if (transition !== 'historical_reuse') { client.setQueryData(queryKeys.waterState(stateId), response.water_state); client.setQueryData(queryKeys.twinState(stateId), response.twin_state); void client.invalidateQueries({ queryKey: queryKeys.session(stateId), exact: true }); }
      if (response.advancement_created) { setWeather(undefined); setIrrigation(undefined); identities.clearAdvancement(); }
    } catch (cause) { if (!(cause instanceof CropTwinApiError && cause.kind === 'cancelled')) { setError(cause); if (signature && cause instanceof CropTwinApiError && ['DAILY_ADVANCEMENT_DATE_CONFLICT', 'DAILY_ADVANCEMENT_PAYLOAD_CONFLICT', 'DAILY_ADVANCEMENT_TARGET_CONFLICT'].includes(cause.code)) identities.clearAdvancement(signature); } }
  }
  if (!requiredDate) return <SectionCard title="Advance one day" accent="agronomy"><ErrorState title="Advancement blocked" description="The authoritative water timestamp cannot establish a UTC calendar date." /></SectionCard>;
  const friendly = error ? toUserFacingError(error) : undefined; const errorCode = error instanceof CropTwinApiError ? error.code : undefined; const errorDescription = errorCode === 'DAILY_ADVANCEMENT_DISEASE_REQUIRED' ? 'FastAPI requires disease evidence for this session. Add evidence and explicitly retry.' : errorCode === 'DAILY_ADVANCEMENT_BASELINE_REQUIRED' ? 'FastAPI requires an initial canonical water baseline. Compute water state before advancing.' : errorCode === 'DAILY_ADVANCEMENT_DATE_CONFLICT' ? 'The canonical baseline changed. Review the required next date and prepare that day’s inputs again.' : friendly?.description;
  function acceptWeather(next: ReviewedWeather | undefined) { setWeather(next); setIrrigation(undefined); }
  const inputCurrent = weather?.targetDate === requiredDate && irrigation?.stateId === stateId;
  return <SectionCard title="Advance exactly one day" accent="agronomy"><Text>FastAPI performs the complete deterministic transition. The target is read-only and exactly one UTC calendar day after the canonical water date.</Text><MetricRow label="Canonical base date" value={water.observed_at.slice(0, 10)} /><MetricRow label="Required target date" value={requiredDate} /><MetricRow label="Base sequence" value={water.water_sequence} /><WeatherWorkflow key={`advance-weather-${requiredDate}`} stateId={stateId} lockedTargetDate={requiredDate} onAcceptedChange={acceptWeather} /><IrrigationWorkflow key={`advance-irrigation-${requiredDate}`} stateId={stateId} targetDate={requiredDate} onAcceptedChange={setIrrigation} /><PrimaryButton disabled={!inputCurrent || mutation.isPending} onPress={() => void submit()}>{mutation.isPending ? 'Advancing one day…' : 'Advance one day'}</PrimaryButton>{lastRequest ? <SecondaryButton disabled={mutation.isPending} onPress={() => void submit(lastRequest)}>Retry exact advancement</SecondaryButton> : null}{friendly && errorDescription ? <ErrorState title="Daily advancement unavailable" description={errorDescription} technicalDetails={friendly.technicalDetails} /> : null}{accepted ? <AdvancementResult accepted={accepted} /> : <EmptyState title="No advancement result" description="Review weather and irrigation for the required target date before advancing." />}<TechnicalDetails details={{ state_id: stateId, twin_snapshot_id: twin.snapshot_id }} /></SectionCard>;
}

export function AdvancementResult({ accepted }: { accepted: AcceptedAdvancement }) { const result = accepted.response; const reused = !result.advancement_created; return <SectionCard title={result.advancement_created ? 'Canonical state advanced one day' : 'Existing advancement idempotently reused'} accent="agronomy"><StatusBadge label={reused ? 'Advancement reused' : 'Advancement created'} tone="success" /><MetricRow label="Target date" value={result.target_date} /><MetricRow label="Transition" value={accepted.transition.replaceAll('_', ' ')} /><WaterResult result={result.water_state} /><TwinResult result={result.twin_state} /><TechnicalDetails details={{ advancement_id: result.advancement_id, advancement_created: result.advancement_created }} /></SectionCard>; }
