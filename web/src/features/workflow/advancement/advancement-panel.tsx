"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, CalendarDays, RotateCcw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiErrorPanel } from "@/components/shared-states/api-error-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AdvanceOneDayRequest, UpdateTwinStateResponse } from "@/lib/api/contracts";
import { useAdvanceOneDay, useUpdateTwinState } from "@/lib/api/hooks/use-workflow";
import { queryKeys } from "@/lib/api/query-keys";
import { localDateTimeInputValue } from "@/lib/dates/local-date";
import { IrrigationStage } from "../irrigation/irrigation-stage";
import { currentIrrigationSignature, type AcceptedIrrigation, type IrrigationDraft } from "../irrigation/irrigation-draft";
import { WeatherStage } from "../weather/weather-stage";
import { currentWeatherSignature, emptyWeatherValues, type AcceptedWeather, type WeatherDraft } from "../weather/weather-draft";
import { materializeIrrigation } from "../identity";
import type { WorkflowIdentityStore } from "../identity-store";
import type { AcceptedAdvancementResult, AcceptedTwinResult, AcceptedWaterResult } from "../workflow-results";
import { twinSourceSignature } from "../twin/twin-utils";
import { advancementPayloadSignature, classifyAdvancement, deriveNextAdvancementDate, transitionNeedsTwinRefresh, type TwinRefreshStatus } from "./advancement-utils";
import type { CachedDiseaseEvidence } from "@/lib/api/hooks/use-workflow";

function irrigationDraft(): IrrigationDraft { return { mode: "none", timestamp: localDateTimeInputValue(), directDepth: "0", totalLitres: "0", litresArea: "", emitterCount: "", emitterFlow: "", runtimeMinutes: "", dripArea: "" }; }

export function AdvancementPanel({ stateId, disease, water, twin, workflowSourceSignature, identityStore, mutationLocked, onPending, onApplied }: { stateId: string; disease: CachedDiseaseEvidence; water: AcceptedWaterResult; twin: AcceptedTwinResult; workflowSourceSignature: string; identityStore: WorkflowIdentityStore; mutationLocked: boolean; onPending: (pending: boolean) => void; onApplied: (value: { water: AcceptedWaterResult; twin?: AcceptedTwinResult; advancement: AcceptedAdvancementResult }) => void }) {
  const queryClient = useQueryClient(); const advance = useAdvanceOneDay(); const refreshTwin = useUpdateTwinState();
  const requiredDate = deriveNextAdvancementDate(water.response.observed_at); const baseSignature = `${water.response.water_observation_id}:${water.response.water_sequence}:${requiredDate ?? "invalid"}`;
  const [weatherDraft, setWeatherDraft] = useState<WeatherDraft>({ targetDate: requiredDate ?? "", provenance: "manual", values: { ...emptyWeatherValues } });
  const [acceptedWeather, setAcceptedWeather] = useState<AcceptedWeather>(); const [irrigationInput, setIrrigationInput] = useState<IrrigationDraft>(irrigationDraft); const [acceptedIrrigation, setAcceptedIrrigation] = useState<AcceptedIrrigation>();
  const [error, setError] = useState<unknown>(); const [last, setLast] = useState<AcceptedAdvancementResult>(); const generation = useRef(0); const mounted = useRef(true); const baseRef = useRef(baseSignature);
  useEffect(() => { baseRef.current = baseSignature; }, [baseSignature]);
  useEffect(() => () => { mounted.current = false; generation.current += 1; }, []);
  const weatherCurrent = Boolean(acceptedWeather && acceptedWeather.signature === currentWeatherSignature(stateId, weatherDraft, queryClient.getQueryData(queryKeys.weatherSnapshot(stateId, weatherDraft.targetDate))));
  const irrigationCurrent = Boolean(acceptedIrrigation && acceptedIrrigation.semanticSignature === currentIrrigationSignature(stateId, irrigationInput));

  async function submit(explicitRequest?: AdvanceOneDayRequest) {
    if (!requiredDate || mutationLocked || advance.isPending || refreshTwin.isPending) return;
    let input = explicitRequest; let signature = last?.sourceSignature;
    if (!input) {
      if (!weatherCurrent || !acceptedWeather || !irrigationCurrent || !acceptedIrrigation) return;
      const eventId = acceptedIrrigation.mode === "none" ? undefined : identityStore.irrigationId("advancement", acceptedIrrigation.semanticSignature);
      const event = materializeIrrigation(acceptedIrrigation, eventId); signature = advancementPayloadSignature(stateId, requiredDate, acceptedWeather.weather, event);
      input = { state_id: stateId, advancement_id: identityStore.advancementId(signature), target_date: requiredDate, weather: acceptedWeather.weather, last_irrigation_event: event };
    }
    const requestGeneration = ++generation.current; const capturedBase = baseRef.current; const localSequence = water.response.water_sequence; const controller = new AbortController(); setError(undefined); onPending(true);
    try {
      const response = await advance.mutateAsync({ stateId, input, signal: controller.signal });
      if (!mounted.current || generation.current !== requestGeneration || baseRef.current !== capturedBase) return;
      const transition = classifyAdvancement(response, localSequence); let nextTwin: UpdateTwinStateResponse | undefined = transition === "new_advancement" ? response.twin_state : transition === "catch_up_retry" ? undefined : twin.response; let refreshStatus: TwinRefreshStatus = "not_required";
      if (transitionNeedsTwinRefresh(transition, nextTwin)) {
        refreshStatus = "pending";
        try { const refreshed = await refreshTwin.mutateAsync({ stateId, signal: controller.signal }); if (!mounted.current || generation.current !== requestGeneration) return; nextTwin = refreshed; refreshStatus = "succeeded"; }
        catch (cause) { refreshStatus = "failed"; setError(cause); }
      }
      const replaceWater = transition === "new_advancement" || transition === "catch_up_retry"; const canonicalWater = replaceWater ? response.water_state : water.response;
      const acceptedWater = { ...water, response: canonicalWater, sourceSignature: workflowSourceSignature, waterUpdateId: canonicalWater.water_update_id ?? water.waterUpdateId };
      const acceptedTwin = nextTwin ? { response: nextTwin, sourceSignature: twinSourceSignature(stateId, disease.response, canonicalWater) } : undefined;
      const accepted = { response, sourceSignature: signature!, advancementId: input.advancement_id, transition, status: refreshStatus === "failed" ? "partial" : transition === "historical_retry" ? "historical" : "current", twinRefreshStatus: refreshStatus, request: input } satisfies AcceptedAdvancementResult;
      queryClient.setQueryData(queryKeys.advancement(stateId, input.advancement_id), response); if (replaceWater) queryClient.setQueryData(queryKeys.waterState(stateId), canonicalWater); if (acceptedTwin) queryClient.setQueryData(queryKeys.twinState(stateId), acceptedTwin.response);
      setLast(accepted); onApplied({ water: acceptedWater, twin: acceptedTwin, advancement: accepted });
      if (transition === "new_advancement") { const nextDate = deriveNextAdvancementDate(response.water_state.observed_at) ?? ""; setWeatherDraft({ targetDate: nextDate, provenance: "manual", values: { ...emptyWeatherValues } }); setAcceptedWeather(undefined); setIrrigationInput(irrigationDraft()); setAcceptedIrrigation(undefined); identityStore.clearAdvancement(); }
    } catch (cause) { if (mounted.current && generation.current === requestGeneration) { if (cause && typeof cause === "object" && "code" in cause && cause.code === "DAILY_ADVANCEMENT_PAYLOAD_CONFLICT") identityStore.clearAdvancement(); setError(cause); } } finally { if (generation.current === requestGeneration) onPending(false); }
  }
  if (!requiredDate) return <Alert variant="warning"><CalendarDays className="size-5" aria-hidden="true" /><AlertTitle>Advancement blocked</AlertTitle><AlertDescription>The canonical water timestamp cannot produce a valid UTC calendar date.</AlertDescription></Alert>;
  return <div className="grid gap-5"><Card><CardHeader><CardTitle>Canonical base and required date</CardTitle><CardDescription>Exactly one UTC calendar day; the target cannot be edited.</CardDescription></CardHeader><CardContent><dl className="grid gap-3 sm:grid-cols-2"><Row term="Canonical base date" value={water.response.observed_at.slice(0, 10)} /><Row term="Required target date" value={requiredDate} /><Row term="Base observation ID" value={water.response.water_observation_id ?? "Unavailable"} /><Row term="Base sequence" value={String(water.response.water_sequence)} /></dl></CardContent></Card><section aria-labelledby="advance-weather"><h3 id="advance-weather" className="mb-3 text-lg font-semibold text-[var(--text-strong)]">Next-day weather</h3><WeatherStage stateId={stateId} draft={weatherDraft} accepted={acceptedWeather} lockedTargetDate={requiredDate} onDraftChange={(next) => { setWeatherDraft({ ...next, targetDate: requiredDate }); setAcceptedWeather(undefined); identityStore.clearAdvancement(); }} onAccept={setAcceptedWeather} /></section><section aria-labelledby="advance-irrigation"><h3 id="advance-irrigation" className="mb-3 text-lg font-semibold text-[var(--text-strong)]">Next-day irrigation</h3><IrrigationStage stateId={stateId} draft={irrigationInput} accepted={acceptedIrrigation} purpose="advancement" onDraftChange={(next) => { setIrrigationInput(next); setAcceptedIrrigation(undefined); identityStore.clearAdvancement(); }} onAccept={setAcceptedIrrigation} /></section><div className="flex flex-wrap gap-3"><Button type="button" onClick={() => void submit()} disabled={!weatherCurrent || !irrigationCurrent || mutationLocked || advance.isPending || refreshTwin.isPending} aria-busy={advance.isPending || refreshTwin.isPending}><ArrowRight className="size-4" aria-hidden="true" />{advance.isPending ? "Advancing one day…" : refreshTwin.isPending ? "Refreshing canonical twin…" : "Advance one day"}</Button>{last ? <Button type="button" variant="outline" onClick={() => void submit(last.request)} disabled={mutationLocked || advance.isPending || refreshTwin.isPending}><RotateCcw className="size-4" aria-hidden="true" />Retry exact advancement</Button> : null}</div>{error ? <ApiErrorPanel error={error} title={last?.status === "partial" ? "Advancement succeeded; twin refresh failed" : "Daily advancement unavailable"} /> : null}{last ? <Alert variant={last.status === "partial" ? "warning" : "success"}><RotateCcw className="size-5" aria-hidden="true" /><AlertTitle>{last.transition === "new_advancement" ? "Advanced canonical state by one day" : last.transition === "current_retry" ? "Current advancement result idempotently reused" : last.transition === "catch_up_retry" ? "Caught up to a newer known water lineage" : "Older idempotent advancement retained as history"}</AlertTitle><AlertDescription>Transition: {last.transition.replaceAll("_", " ")} · Twin refresh: {last.twinRefreshStatus.replaceAll("_", " ")}. {last.transition === "historical_retry" ? "Current canonical water and twin were not replaced." : "Simulation remains blocked."}</AlertDescription></Alert> : null}</div>;
}
function Row({ term, value }: { term: string; value: string }) { return <div><dt className="text-xs text-[var(--text-muted)]">{term}</dt><dd className="break-all text-sm font-semibold">{value}</dd></div>; }
