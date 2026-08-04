import type { AdvanceOneDayResponse, LastIrrigationEvent, UpdateTwinStateResponse, WeatherInput } from "@/lib/api/contracts";
import { canonicalJson } from "../identity";

export type AdvancementTransitionKind = "new_advancement" | "current_retry" | "catch_up_retry" | "historical_retry";
export type TwinRefreshStatus = "not_required" | "pending" | "succeeded" | "failed";

export function deriveNextAdvancementDate(observedAt: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(observedAt) || Number.isNaN(Date.parse(observedAt))) return undefined;
  const date = new Date(observedAt);
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
  return next.toISOString().slice(0, 10);
}

export function advancementPayloadSignature(stateId: string, targetDate: string, weather: WeatherInput, irrigation: LastIrrigationEvent | null) {
  return canonicalJson({ state_id: stateId, target_date: targetDate, weather, last_irrigation_event: irrigation });
}

export function classifyAdvancement(response: AdvanceOneDayResponse, localSequence: number): AdvancementTransitionKind {
  if (response.advancement_created) return "new_advancement";
  if (response.water_state.water_sequence > localSequence) return "catch_up_retry";
  if (response.water_state.water_sequence < localSequence) return "historical_retry";
  return "current_retry";
}

export function transitionNeedsTwinRefresh(kind: AdvancementTransitionKind, twin: UpdateTwinStateResponse | undefined) {
  return kind === "catch_up_retry" || (kind === "current_retry" && !twin);
}
