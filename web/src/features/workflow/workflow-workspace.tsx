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
import { DiseaseStage } from "./disease/disease-stage";
import { IrrigationStage } from "./irrigation/irrigation-stage";
import { currentIrrigationSignature, type AcceptedIrrigation, type IrrigationDraft } from "./irrigation/irrigation-draft";
import { WeatherStage } from "./weather/weather-stage";
import { emptyWeatherValues, currentWeatherSignature, type AcceptedWeather, type WeatherDraft } from "./weather/weather-draft";

type StageId = "session" | "disease" | "weather" | "irrigation" | "water" | "twin" | "simulation" | "recommendation" | "narration";
const stageIds: StageId[] = ["session", "disease", "weather", "irrigation", "water", "twin", "simulation", "recommendation", "narration"];

function newIrrigationDraft(): IrrigationDraft { return { mode: "none", timestamp: localDateTimeInputValue(), directDepth: "0", totalLitres: "0", litresArea: "", emitterCount: "", emitterFlow: "", runtimeMinutes: "", dripArea: "" }; }

export function WorkflowWorkspace({ stateId }: { stateId: string }) {
  const queryClient = useQueryClient();
  const session = useSession(stateId);
  const preSnapshot = session.error instanceof CropTwinApiError && session.error.code === "MISSING_CACHED_OUTPUT";
  const recognized = Boolean(session.data || preSnapshot);
  const [activeStage, setActiveStage] = useState<StageId>("disease");
  const [disease, setDisease] = useState<CachedDiseaseEvidence | undefined>(() => queryClient.getQueryData(queryKeys.diseaseEvidence(stateId)));
  const defaultTargetDate = initialWeatherDate(session.data?.planting_date);
  const [weatherDraftState, setWeatherDraft] = useState<WeatherDraft>();
  const weatherDraft = weatherDraftState ?? { targetDate: defaultTargetDate, provenance: "manual", values: { ...emptyWeatherValues } } satisfies WeatherDraft;
  const [acceptedWeather, setAcceptedWeather] = useState<AcceptedWeather>();
  const [irrigationDraft, setIrrigationDraft] = useState<IrrigationDraft>(newIrrigationDraft);
  const [acceptedIrrigation, setAcceptedIrrigation] = useState<AcceptedIrrigation>();
  const weatherCurrent = Boolean(acceptedWeather && acceptedWeather.signature === currentWeatherSignature(stateId, weatherDraft, queryClient.getQueryData(queryKeys.weatherSnapshot(stateId, weatherDraft.targetDate))));
  const irrigationCurrent = Boolean(acceptedIrrigation && acceptedIrrigation.semanticSignature === currentIrrigationSignature(stateId, irrigationDraft));

  const steps = useMemo<WorkflowStep[]>(() => stageIds.map((id, index) => {
    const completed = id === "session" ? recognized : id === "disease" ? Boolean(disease) : id === "weather" ? weatherCurrent : id === "irrigation" ? irrigationCurrent : false;
    const available = id === "disease" ? recognized : id === "weather" ? Boolean(disease) : id === "irrigation" ? weatherCurrent : false;
    const future = index >= 4;
    const interactive = completed || available;
    return { id, label: workflowStepLabels[index], status: activeStage === id && interactive ? "active" : completed ? "completed" : future || !available ? "blocked" : "available", prerequisite: future ? "Milestone 4 or later" : id === "disease" ? "recognized state ID" : id === "weather" ? "accepted disease evidence" : id === "irrigation" ? "accepted reviewed weather" : undefined, interactive };
  }), [activeStage, disease, irrigationCurrent, recognized, weatherCurrent]);

  if (session.isLoading) return <AsyncStatePanel kind="loading" title="Recognizing workflow session" />;
  if (session.isError && !preSnapshot) return <ApiErrorPanel error={session.error} onRetry={() => session.refetch()} title="Workflow session unavailable" />;

  function supersedeDisease() {
    setDisease(undefined);
    setWeatherDraft({ targetDate: defaultTargetDate, provenance: "manual", values: { ...emptyWeatherValues } });
    setAcceptedWeather(undefined);
    setIrrigationDraft(newIrrigationDraft());
    setAcceptedIrrigation(undefined);
  }

  return <><PageIntro eyebrow="Guided workflow" title="Evidence and input preparation" description="Complete the first four state-scoped stages. Water-state computation and later decisions remain blocked for a later milestone." />
    <Card className="mb-5"><CardHeader><CardTitle>State-scoped progress</CardTitle><CardDescription>State ID is authoritative route identity. Completed stages remain keyboard reachable for review.</CardDescription></CardHeader><CardContent><WorkflowStepper steps={steps} onStepSelect={(step) => setActiveStage(step.id as StageId)} /></CardContent></Card>
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_19rem]"><main className="min-w-0">{activeStage === "session" ? <Alert variant="success"><CheckCircle2 className="size-5" aria-hidden="true" /><AlertTitle>Session recognized</AlertTitle><AlertDescription>{preSnapshot ? "FastAPI recognizes this state ID. A missing current twin snapshot is normal and does not block evidence preparation." : "FastAPI returned authoritative session data for this state ID."}</AlertDescription></Alert> : null}{activeStage === "disease" ? <DiseaseStage stateId={stateId} accepted={disease} onAccepted={setDisease} onSuperseded={supersedeDisease} /> : null}{activeStage === "weather" ? disease ? <WeatherStage stateId={stateId} draft={weatherDraft} accepted={acceptedWeather} onDraftChange={(next) => { setWeatherDraft(next); if (acceptedWeather?.signature !== currentWeatherSignature(stateId, next, queryClient.getQueryData(queryKeys.weatherSnapshot(stateId, next.targetDate)))) setAcceptedIrrigation(undefined); }} onAccept={(value) => { setAcceptedWeather(value); setAcceptedIrrigation(undefined); }} /> : <Blocked title="Weather is blocked" description="Accept disease evidence first." /> : null}{activeStage === "irrigation" ? weatherCurrent ? <IrrigationStage stateId={stateId} draft={irrigationDraft} accepted={acceptedIrrigation} onDraftChange={setIrrigationDraft} onAccept={setAcceptedIrrigation} /> : <Blocked title="Irrigation is blocked" description="Accept the current reviewed weather first." /> : null}{["water", "twin", "simulation", "recommendation", "narration"].includes(activeStage) ? <Blocked title={`${workflowStepLabels[stageIds.indexOf(activeStage)]} is not implemented`} description="This stage belongs to Milestone 4 or later. No request or demonstration completion is available." /> : null}</main>
      <aside className="grid content-start gap-4" aria-label="Workflow context"><Card><CardHeader><CardTitle className="text-base">Workflow context</CardTitle></CardHeader><CardContent><dl className="grid gap-3 text-sm"><Context term="State ID" value={stateId} mono /><Context term="Disease" value={disease ? `${disease.response.uncertainty_band} uncertainty accepted` : "Not accepted"} /><Context term="Weather" value={weatherCurrent && acceptedWeather ? `${acceptedWeather.targetDate} · ${acceptedWeather.provenance.replace("_", " ")}` : acceptedWeather ? "Accepted draft is stale" : "Not accepted"} /><Context term="Irrigation" value={irrigationCurrent && acceptedIrrigation ? acceptedIrrigation.distinction.replaceAll("_", " ") : acceptedIrrigation ? "Accepted draft is stale" : "Not accepted"} /><Context term="Later stages" value="Blocked" /></dl><p className="mt-4 text-xs leading-5 text-[var(--text-muted)]">Reviewed weather and irrigation are unsaved browser drafts. They are not persisted to FastAPI.</p></CardContent></Card></aside></div>
  </>;
}

function Blocked({ title, description }: { title: string; description: string }) { return <Alert variant="neutral"><LockKeyhole className="size-5" aria-hidden="true" /><AlertTitle>{title}</AlertTitle><AlertDescription>{description}</AlertDescription></Alert>; }
function Context({ term, value, mono }: { term: string; value: string; mono?: boolean }) { return <div><dt className="text-[var(--text-muted)]">{term}</dt><dd className={mono ? "break-all font-mono text-xs font-semibold" : "font-semibold"}>{value}</dd></div>; }
