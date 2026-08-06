import type { AdvanceOneDayResponse, LastIrrigationEvent, UpdateTwinStateResponse, WeatherInput } from "@/lib/api/contracts";
import { canonicalJson } from "../identity";
import { CropTwinApiError } from "@/lib/api/errors";

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

export function validateNewAdvancementLineage(response: AdvanceOneDayResponse, baseObservationId: string | null, baseSequence: number) {
  if (!response.advancement_created) return;
  const water = response.water_state;
  if (water.base_water_observation_id !== baseObservationId || water.base_water_sequence !== baseSequence || water.water_sequence !== baseSequence + 1) {
    throw new CropTwinApiError({
      kind: "malformed",
      code: "INVALID_ADVANCEMENT_LINEAGE",
      message: "The advancement response did not extend the captured canonical water baseline.",
      details: { expected_base_observation_id: baseObservationId, expected_base_sequence: baseSequence, received_base_observation_id: water.base_water_observation_id, received_base_sequence: water.base_water_sequence, received_sequence: water.water_sequence },
    });
  }
}
