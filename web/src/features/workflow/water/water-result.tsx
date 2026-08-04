import { Droplets, ShieldCheck } from "lucide-react";
import { TechnicalDetails } from "@/components/data/technical-details";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { WaterStateResponse } from "@/lib/api/contracts";
import { formatWaterNumber } from "./water-utils";

export function WaterResult({ result }: { result: WaterStateResponse }) {
  const values = [
    ["Observation date", result.observed_at.slice(0, 10)], ["Water sequence", String(result.water_sequence)], ["Growth stage", result.growth_stage.replaceAll("_", " ")],
    ["ETo", formatWaterNumber(result.eto_computed, " mm")], ["ETo method", result.eto_method.replaceAll("_", " ")], ["Crop coefficient", formatWaterNumber(result.kc)],
    ["ETc", formatWaterNumber(result.etc, " mm")], ["Previous depletion", formatWaterNumber(result.previous_root_zone_depletion_mm, " mm")],
    ["Raw depletion", formatWaterNumber(result.raw_root_zone_depletion_mm, " mm")], ["Bounded depletion", formatWaterNumber(result.root_zone_depletion_mm, " mm")],
    ["RAW threshold", formatWaterNumber(result.raw_threshold, " mm")], ["Total available water", formatWaterNumber(result.taw, " mm")],
    ["Water surplus", formatWaterNumber(result.water_surplus_mm, " mm")], ["Beyond TAW", formatWaterNumber(result.depletion_beyond_taw_mm, " mm")],
  ];
  return <div className="grid gap-4">
    <Alert variant="success"><ShieldCheck className="size-5" aria-hidden="true" /><AlertTitle>Accepted deterministic water result</AlertTitle><AlertDescription>Computed by FastAPI agronomy. FastAPI may idempotently reuse an existing result for the same update ID.</AlertDescription></Alert>
    <Card className="border-[var(--agronomy-border)]"><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>Root-zone water balance</CardTitle><Badge variant="agronomy">◆ Deterministic agronomy</Badge></div><CardDescription>Decision-ready values returned by the canonical water engine.</CardDescription></CardHeader><CardContent className="grid gap-5"><dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{values.map(([term, value]) => <Metric key={term} term={term} value={value} />)}</dl><div className="flex flex-wrap gap-2"><Badge variant="info">Moisture · {result.estimated_moisture_state.replaceAll("_", " ")}</Badge><Badge variant={result.stress_band === "low" ? "success" : "warning"}>Stress · {result.stress_band}</Badge></div></CardContent></Card>
    <Card><CardHeader><CardTitle>Irrigation accounting</CardTitle><CardDescription>Reported describes the request; applied means newly included by this computation.</CardDescription></CardHeader><CardContent className="grid gap-4"><dl className="grid gap-3 sm:grid-cols-2"><Metric term="Reported event ID" value={result.reported_irrigation_event_id ?? "No event reported"} /><Metric term="Applied event ID" value={result.applied_irrigation_event_id ?? "No event newly applied"} /><Metric term="Effective irrigation" value={formatWaterNumber(result.effective_irrigation_mm, " mm")} /><Metric term="Already accounted for" value={result.irrigation_event_already_accounted_for ? "Yes — FastAPI prevented double counting" : "No"} /></dl>{result.irrigation_event_already_accounted_for ? <Alert variant="warning"><Droplets className="size-5" aria-hidden="true" /><AlertTitle>Reported irrigation was already accounted for</AlertTitle><AlertDescription>FastAPI applied 0 mm from this repeated physical event.</AlertDescription></Alert> : null}</CardContent></Card>
    <TechnicalDetails label="Water lineage and timestamps" value={{ water_observation_id: result.water_observation_id, water_sequence: result.water_sequence, base_water_observation_id: result.base_water_observation_id, base_water_sequence: result.base_water_sequence, water_update_id: result.water_update_id, observation_time_basis: result.observation_time_basis, observed_at: result.observed_at, computed_at: result.computed_at }} />
  </div>;
}

function Metric({ term, value }: { term: string; value: string }) { return <div className="min-w-0"><dt className="text-xs font-medium text-[var(--text-muted)]">{term}</dt><dd className="break-words text-sm font-semibold text-[var(--text-strong)]">{value}</dd></div>; }
