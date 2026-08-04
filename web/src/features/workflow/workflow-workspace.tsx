"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, LockKeyhole } from "lucide-react";
import { PageIntro } from "@/components/app-shell/page-intro";
import { ApiErrorPanel } from "@/components/shared-states/api-error-panel";
import { AsyncStatePanel } from "@/components/shared-states/async-state-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkflowStepper, workflowStepLabels, type WorkflowStep } from "@/components/workflow/workflow-stepper";
import { CropTwinApiError } from "@/lib/api/errors";
import type { CachedDiseaseEvidence } from "@/lib/api/hooks/use-workflow";
import { useSession } from "@/lib/api/hooks/use-sessions";
import { queryKeys } from "@/lib/api/query-keys";
import { initialWeatherDate, localDateTimeInputValue } from "@/lib/dates/local-date";
import { canonicalJson } from "./identity";
import { WorkflowIdentityStore } from "./identity-store";
import { DiseaseStage } from "./disease/disease-stage";
import { IrrigationStage } from "./irrigation/irrigation-stage";
import { currentIrrigationSignature, type AcceptedIrrigation, type IrrigationDraft } from "./irrigation/irrigation-draft";
import { TwinStage } from "./twin/twin-stage";
import { twinSourceSignature } from "./twin/twin-utils";
import { WaterStage } from "./water/water-stage";
import { WeatherStage } from "./weather/weather-stage";
import { emptyWeatherValues, currentWeatherSignature, type AcceptedWeather, type WeatherDraft } from "./weather/weather-draft";
import type { AcceptedAdvancementResult, AcceptedTwinResult, AcceptedWaterResult } from "./workflow-results";
import type { AcceptedNarrationResult, AcceptedRecommendationResult, AcceptedSimulationResult } from "./workflow-results";
import { useMutationCoordinator } from "./mutation-coordinator";
import { SimulationStage } from "./simulation/simulation-stage";
import { RecommendationStage } from "./recommendation/recommendation-stage";
import { NarrationStage } from "./narration/narration-stage";

type StageId = "session" | "disease" | "weather" | "irrigation" | "water" | "twin" | "simulation" | "recommendation" | "narration";
const stageIds: StageId[] = ["session", "disease", "weather", "irrigation", "water", "twin", "simulation", "recommendation", "narration"];
function newIrrigationDraft(): IrrigationDraft { return { mode: "none", timestamp: localDateTimeInputValue(), directDepth: "0", totalLitres: "0", litresArea: "", emitterCount: "", emitterFlow: "", runtimeMinutes: "", dripArea: "" }; }

export function WorkflowWorkspace({ stateId }: { stateId: string }) {
  const queryClient = useQueryClient(); const session = useSession(stateId); const preSnapshot = session.error instanceof CropTwinApiError && session.error.code === "MISSING_CACHED_OUTPUT"; const recognized = Boolean(session.data || preSnapshot);
  const [identities] = useState(() => new WorkflowIdentityStore()); const [activeStage, setActiveStage] = useState<StageId>("disease"); const coordinator = useMutationCoordinator();
  const [disease, setDisease] = useState<CachedDiseaseEvidence | undefined>(() => queryClient.getQueryData(queryKeys.diseaseEvidence(stateId)));
  const defaultTargetDate = initialWeatherDate(session.data?.planting_date); const [weatherDraftState, setWeatherDraft] = useState<WeatherDraft>(); const weatherDraft = weatherDraftState ?? { targetDate: defaultTargetDate, provenance: "manual", values: { ...emptyWeatherValues } } satisfies WeatherDraft;
  const [acceptedWeather, setAcceptedWeather] = useState<AcceptedWeather>(); const [irrigationDraft, setIrrigationDraft] = useState<IrrigationDraft>(newIrrigationDraft); const [acceptedIrrigation, setAcceptedIrrigation] = useState<AcceptedIrrigation>();
  const [water, setWater] = useState<AcceptedWaterResult>(); const [twin, setTwin] = useState<AcceptedTwinResult>(); const [advancement, setAdvancement] = useState<AcceptedAdvancementResult>();
  const [simulation, setSimulation] = useState<AcceptedSimulationResult>(); const [simulationCurrent, setSimulationCurrent] = useState(false);
  const [recommendation, setRecommendation] = useState<AcceptedRecommendationResult>(); const [recommendationCurrent, setRecommendationCurrent] = useState(false);
  const [narration, setNarration] = useState<AcceptedNarrationResult>(); const [narrationCurrent, setNarrationCurrent] = useState(false);
  const weatherCurrent = Boolean(acceptedWeather && acceptedWeather.signature === currentWeatherSignature(stateId, weatherDraft, queryClient.getQueryData(queryKeys.weatherSnapshot(stateId, weatherDraft.targetDate))));
  const irrigationCurrent = Boolean(acceptedIrrigation && acceptedIrrigation.semanticSignature === currentIrrigationSignature(stateId, irrigationDraft));
  const waterSource = disease && acceptedWeather && acceptedIrrigation ? canonicalJson({ state_id: stateId, evidence_acceptance_id: disease.evidenceAcceptanceId, weather: acceptedWeather.signature, irrigation: acceptedIrrigation.semanticSignature }) : undefined;
  const waterCurrent = Boolean(water && disease && water.evidenceAcceptanceId === disease.evidenceAcceptanceId && (water.origin === "advancement" || (waterSource && weatherCurrent && irrigationCurrent && water.sourceSignature === waterSource)));
  const twinSource = disease && waterCurrent && water ? twinSourceSignature(stateId, disease.evidenceAcceptanceId, water.canonicalSourceId) : undefined; const twinCurrent = Boolean(twin && twinSource && twin.sourceSignature === twinSource);

  const steps = useMemo<WorkflowStep[]>(() => stageIds.map((id, index) => {
    const completed = id === "session" ? recognized : id === "disease" ? Boolean(disease) : id === "weather" ? weatherCurrent : id === "irrigation" ? irrigationCurrent : id === "water" ? waterCurrent : id === "twin" ? twinCurrent : id === "simulation" ? simulationCurrent : id === "recommendation" ? recommendationCurrent : narrationCurrent;
    const available = id === "disease" ? recognized : id === "weather" ? Boolean(disease) : id === "irrigation" ? weatherCurrent : id === "water" ? Boolean(disease && weatherCurrent && irrigationCurrent) : id === "twin" ? Boolean(disease && waterCurrent) : id === "simulation" ? twinCurrent : id === "recommendation" ? simulationCurrent : recommendationCurrent;
    const interactive = completed || available;
    return { id, label: workflowStepLabels[index], status: activeStage === id && interactive ? "active" : completed ? "completed" : !available ? "blocked" : "available", prerequisite: id === "water" ? "current disease, weather and irrigation" : id === "twin" ? "current disease and water lineage" : id === "simulation" ? "current canonical twin" : id === "recommendation" ? "current simulation" : id === "narration" ? "current recommendation" : id === "disease" ? "recognized state ID" : id === "weather" ? "accepted disease evidence" : id === "irrigation" ? "accepted reviewed weather" : undefined, interactive };
  }), [activeStage, disease, irrigationCurrent, narrationCurrent, recommendationCurrent, recognized, simulationCurrent, twinCurrent, waterCurrent, weatherCurrent]);

  if (session.isLoading) return <AsyncStatePanel kind="loading" title="Recognizing workflow session" />;
  if (session.isError && !preSnapshot) return <ApiErrorPanel error={session.error} onRetry={() => session.refetch()} title="Workflow session unavailable" />;
  function invalidateDecisions() { setSimulationCurrent(false); setRecommendationCurrent(false); setNarrationCurrent(false); }
  function invalidateDownstream() { setAdvancement(undefined); invalidateDecisions(); identities.clearWater(); identities.clearAdvancement(); }
  function supersedeDisease() { setDisease(undefined); setWeatherDraft({ targetDate: defaultTargetDate, provenance: "manual", values: { ...emptyWeatherValues } }); setAcceptedWeather(undefined); setIrrigationDraft(newIrrigationDraft()); setAcceptedIrrigation(undefined); invalidateDownstream(); }

  return <><PageIntro eyebrow="Guided workflow" title="Deterministic water and canonical state" description="Build the current FastAPI water lineage, update the canonical twin, then explicitly advance exactly one day when ready." />
    <Card className="mb-5"><CardHeader><CardTitle>State-scoped progress</CardTitle><CardDescription>Move from evidence and agronomy inputs to a deterministic decision and its backend explanation.</CardDescription></CardHeader><CardContent><WorkflowStepper steps={steps} onStepSelect={(step) => { coordinator.cancel(); setActiveStage(step.id as StageId); }} /></CardContent></Card>
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_19rem]"><main className="min-w-0">
      {activeStage === "session" ? <Alert variant="success"><CheckCircle2 className="size-5" aria-hidden="true" /><AlertTitle>Session recognized</AlertTitle><AlertDescription>{preSnapshot ? "FastAPI recognizes this state ID. A missing loaded twin snapshot is normal before canonical update." : "FastAPI returned authoritative session data for this state ID."}</AlertDescription></Alert> : null}
      {activeStage === "disease" ? <DiseaseStage stateId={stateId} accepted={disease} onAccepted={(value) => { setDisease(value); invalidateDownstream(); }} onSuperseded={supersedeDisease} /> : null}
      {activeStage === "weather" ? disease ? <WeatherStage stateId={stateId} draft={weatherDraft} accepted={acceptedWeather} onDraftChange={(next) => { setWeatherDraft(next); if (acceptedWeather?.signature !== currentWeatherSignature(stateId, next, queryClient.getQueryData(queryKeys.weatherSnapshot(stateId, next.targetDate)))) { setAcceptedIrrigation(undefined); invalidateDownstream(); } }} onAccept={(value) => { setAcceptedWeather(value); setAcceptedIrrigation(undefined); invalidateDownstream(); }} /> : <Blocked title="Weather is blocked" description="Accept disease evidence first." /> : null}
      {activeStage === "irrigation" ? weatherCurrent ? <IrrigationStage stateId={stateId} draft={irrigationDraft} accepted={acceptedIrrigation} onDraftChange={(next) => { setIrrigationDraft(next); invalidateDownstream(); }} onAccept={(value) => { setAcceptedIrrigation(value); invalidateDownstream(); }} /> : <Blocked title="Irrigation is blocked" description="Accept the current reviewed weather first." /> : null}
      {activeStage === "water" ? disease && acceptedWeather && acceptedIrrigation && weatherCurrent && irrigationCurrent && waterSource ? <WaterStage stateId={stateId} evidenceAcceptanceId={disease.evidenceAcceptanceId} weather={acceptedWeather} irrigation={acceptedIrrigation} sourceSignature={waterSource} identityStore={identities} baselineResult={water} current={waterCurrent ? water : undefined} coordinator={coordinator} onAccepted={(value) => { setWater(value); setAdvancement(undefined); setActiveStage("twin"); }} /> : <Blocked title="Water state is blocked" description="Current disease evidence, reviewed weather and accepted irrigation are required." /> : null}
      {activeStage === "twin" ? disease && water && waterCurrent && waterSource ? <TwinStage stateId={stateId} disease={disease} water={water} current={twinCurrent ? twin : undefined} advancement={advancement} identityStore={identities} workflowSourceSignature={waterSource} coordinator={coordinator} onAccepted={(value) => { setTwin(value); invalidateDecisions(); }} onAdvancementRecovered={(value) => setAdvancement(value)} onAdvanced={({ water: nextWater, twin: nextTwin, advancement: nextAdvancement }) => { setWater(nextWater); if (nextTwin) setTwin(nextTwin); setAdvancement(nextAdvancement); invalidateDecisions(); }} /> : <Blocked title="Twin update is blocked" description="Current disease evidence and canonical water lineage are required." /> : null}
      {activeStage === "simulation" ? twinCurrent && twinSource ? <SimulationStage stateId={stateId} twinSourceSignature={twinSource} retained={simulation} current={simulationCurrent ? simulation : undefined} onSuperseded={() => { setSimulationCurrent(false); setRecommendationCurrent(false); setNarrationCurrent(false); }} onAccepted={(value) => { setSimulation(value); setSimulationCurrent(true); setRecommendationCurrent(false); setNarrationCurrent(false); setActiveStage("recommendation"); }} /> : <Blocked title="Simulation is blocked" description="Update the current canonical twin first." /> : null}
      {activeStage === "recommendation" ? simulationCurrent && simulation ? <RecommendationStage stateId={stateId} sourceSignature={simulation.sourceSignature} retained={recommendation} current={recommendationCurrent ? recommendation : undefined} onAccepted={(value) => { setRecommendation(value); setRecommendationCurrent(true); setNarrationCurrent(false); setActiveStage("narration"); }} /> : <Blocked title="Recommendation is blocked" description="Run the current deterministic scenario comparison first." /> : null}
      {activeStage === "narration" ? recommendationCurrent && recommendation ? <NarrationStage stateId={stateId} sourceSignature={`${recommendation.sourceSignature}:${recommendation.response.recommendation_id ?? recommendation.response.recommended_at}`} retained={narration} current={narrationCurrent ? narration : undefined} onAccepted={(value) => { setNarration(value); setNarrationCurrent(true); }} /> : <Blocked title="Explanation is blocked" description="Request the current deterministic recommendation first." /> : null}
    </main><aside className="grid content-start gap-4" aria-label="Workflow context"><Card><CardHeader><CardTitle className="text-base">Workflow context</CardTitle></CardHeader><CardContent><dl className="grid gap-3 text-sm"><Context term="State ID" value={stateId} mono /><Context term="Disease · supporting AI" value={disease ? `${disease.response.uncertainty_band} uncertainty accepted` : "Not accepted"} /><Context term="Weather · browser input" value={weatherCurrent && acceptedWeather ? `${acceptedWeather.targetDate} · accepted` : acceptedWeather ? "Accepted draft is stale" : "Not accepted"} /><Context term="Irrigation · browser input" value={irrigationCurrent && acceptedIrrigation ? acceptedIrrigation.distinction.replaceAll("_", " ") : acceptedIrrigation ? "Accepted draft is stale" : "Not accepted"} /><Context term="Water · deterministic" value={waterCurrent && water ? `Sequence ${water.response.water_sequence} current` : water ? "Previous result superseded" : "Not computed"} /><Context term="Twin · canonical" value={twinCurrent && twin ? twin.response.snapshot_created ? "New snapshot current" : "Reused snapshot current" : twin ? "Previous result superseded" : "Not updated"} /><Context term="Decision" value={narrationCurrent ? "Complete" : recommendationCurrent ? "Recommendation ready" : simulationCurrent ? "Simulation ready" : "Awaiting current twin"} /></dl></CardContent></Card></aside></div>
  </>;
}
function Blocked({ title, description }: { title: string; description: string }) { return <Alert variant="neutral"><LockKeyhole className="size-5" aria-hidden="true" /><AlertTitle>{title}</AlertTitle><AlertDescription>{description}</AlertDescription></Alert>; }
function Context({ term, value, mono }: { term: string; value: string; mono?: boolean }) { return <div><dt className="text-[var(--text-muted)]">{term}</dt><dd className={mono ? "break-all font-mono text-xs font-semibold" : "font-semibold"}>{value}</dd></div>; }
