"use client";
import { useEffect, useRef, useState } from "react";
import { Calculator, RefreshCcw } from "lucide-react";
import { ApiErrorPanel } from "@/components/shared-states/api-error-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useComputeWaterState } from "@/lib/api/hooks/use-workflow";
import { queryKeys } from "@/lib/api/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import type { AcceptedIrrigation } from "../irrigation/irrigation-draft";
import type { AcceptedWeather } from "../weather/weather-draft";
import { canonicalJson, materializeIrrigation } from "../identity";
import type { WorkflowIdentityStore } from "../identity-store";
import type { MutationCoordinator, MutationToken } from "../mutation-coordinator";
import type { AcceptedWaterResult } from "../workflow-results";
import { buildComputeWaterRequest, buildWaterSemanticPayload, waterBaseline, waterPayloadSignature } from "./water-utils";
import { WaterResult } from "./water-result";

export function WaterStage({ stateId, evidenceAcceptanceId, weather, irrigation, sourceSignature, identityStore, baselineResult, current, coordinator, onAccepted }: { stateId: string; evidenceAcceptanceId: string; weather: AcceptedWeather; irrigation: AcceptedIrrigation; sourceSignature: string; identityStore: WorkflowIdentityStore; baselineResult?: AcceptedWaterResult; current?: AcceptedWaterResult; coordinator: MutationCoordinator; onAccepted: (result: AcceptedWaterResult) => void }) {
  const queryClient = useQueryClient(); const mutation = useComputeWaterState(); const [error, setError] = useState<unknown>(); const [rebase, setRebase] = useState(false);
  const { active, acquire, cancel, release } = coordinator;
  const generation = useRef(0); const mounted = useRef(true); const sourceRef = useRef(sourceSignature); const tokenRef = useRef<MutationToken | undefined>(undefined);
  useEffect(() => { if (sourceRef.current !== sourceSignature && tokenRef.current) cancel(tokenRef.current); sourceRef.current = sourceSignature; }, [cancel, sourceSignature]);
  useEffect(() => () => { mounted.current = false; generation.current += 1; if (tokenRef.current) cancel(tokenRef.current); }, [cancel]);
  async function submit() {
    if (mutation.isPending || active) return;
    let baseline;
    try { baseline = rebase ? undefined : waterBaseline(baselineResult?.response); } catch (cause) { setError(cause); return; }
    const eventId = irrigation.mode === "none" ? undefined : identityStore.irrigationId("water", irrigation.semanticSignature);
    const event = materializeIrrigation(irrigation, eventId);
    const semanticPayload = buildWaterSemanticPayload(stateId, weather, event, baseline);
    const payloadSignature = waterPayloadSignature(semanticPayload); const waterUpdateId = identityStore.waterId(payloadSignature); const input = buildComputeWaterRequest(semanticPayload, waterUpdateId);
    const token = acquire("water", waterUpdateId); if (!token) return; tokenRef.current = token;
    const requestGeneration = ++generation.current; const capturedSource = sourceSignature; setError(undefined);
    try {
      const response = await mutation.mutateAsync({ stateId, input, signal: token.controller.signal });
      if (!mounted.current || requestGeneration !== generation.current || sourceRef.current !== capturedSource || response.water_update_id !== waterUpdateId) return;
      const canonicalSourceId = canonicalJson({ state_id: stateId, evidence_acceptance_id: evidenceAcceptanceId, water_observation_id: response.water_observation_id, water_sequence: response.water_sequence, water_update_id: response.water_update_id });
      const accepted = { origin: "compute", response, canonicalSourceId, evidenceAcceptanceId, sourceSignature: capturedSource, requestPayloadSignature: payloadSignature, waterUpdateId, irrigationSemanticSignature: irrigation.semanticSignature, ...(eventId ? { irrigationEventId: eventId } : {}) } satisfies AcceptedWaterResult;
      queryClient.setQueryData(queryKeys.waterState(stateId), response); setRebase(false); onAccepted(accepted);
    } catch (cause) { if (mounted.current && requestGeneration === generation.current && !token.controller.signal.aborted) { if (cause && typeof cause === "object" && "code" in cause && cause.code === "WATER_UPDATE_CONFLICT") identityStore.clearWater(); setError(cause); } } finally { release(token); if (tokenRef.current?.id === token.id) tokenRef.current = undefined; }
  }
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  function prepareRebase() { identityStore.clearWater(); setRebase(true); setError(undefined); }
  return <div className="grid gap-5 xl:grid-cols-[minmax(18rem,.7fr)_minmax(0,1.3fr)]"><Card><CardHeader><CardTitle>Compute deterministic water state</CardTitle><CardDescription>The accepted weather date is the computation date. The browser sends no observation timestamp.</CardDescription></CardHeader><CardContent className="grid gap-4"><dl className="grid gap-3 text-sm"><Row term="State ID" value={stateId} /><Row term="Current date" value={weather.targetDate} /><Row term="Weather" value={`${weather.provenance.replaceAll("_", " ")} · accepted`} /><Row term="Irrigation" value={irrigation.distinction.replaceAll("_", " ")} /><Row term="Baseline" value={rebase || !baselineResult ? "Omitted — FastAPI selects canonical baseline" : `Observation ${baselineResult.response.water_observation_id} · sequence ${baselineResult.response.water_sequence}`} /></dl><Button type="button" onClick={() => void submit()} disabled={mutation.isPending || Boolean(active)} aria-busy={mutation.isPending}><Calculator className="size-4" aria-hidden="true" />{mutation.isPending ? "Computing water state…" : current ? "Compute changed water state" : "Compute first water state"}</Button>{mutation.isPending ? <p role="status" className="text-sm text-[var(--text-muted)]">Submitting one authoritative mutation. Duplicate submission is disabled.</p> : null}{error ? <ApiErrorPanel error={error} title="Water computation unavailable" /> : null}{code === "STALE_WATER_BASELINE" ? <Button type="button" variant="outline" onClick={prepareRebase}><RefreshCcw className="size-4" aria-hidden="true" />Rebase water request</Button> : null}{code === "WATER_UPDATE_CONFLICT" ? <Alert variant="warning"><RefreshCcw className="size-5" aria-hidden="true" /><AlertTitle>Update identity conflicted</AlertTitle><AlertDescription>The same update ID was used with another payload. The next explicit submit will use a new ID.</AlertDescription></Alert> : null}</CardContent></Card><div className="min-w-0">{current ? <WaterResult result={current.response} /> : <Alert variant="neutral"><Calculator className="size-5" aria-hidden="true" /><AlertTitle>No deterministic water result yet</AlertTitle><AlertDescription>Submit once when the accepted inputs are ready.</AlertDescription></Alert>}</div></div>;
}
function Row({ term, value }: { term: string; value: string }) { return <div><dt className="text-[var(--text-muted)]">{term}</dt><dd className="break-all font-semibold">{value}</dd></div>; }
