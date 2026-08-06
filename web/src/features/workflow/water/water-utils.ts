import type { components } from "@/lib/api/schema";
import type { AcceptedWeather } from "../weather/weather-draft";
import type { LastIrrigationEvent } from "../identity";
import { canonicalJson } from "../identity";

export type ComputeWaterStateRequest = components["schemas"]["ComputeWaterStateRequest"];
export type WaterStateResponse = components["schemas"]["WaterStateResponse"];

export interface WaterBaseline { observationId: string; sequence: number }

export function waterBaseline(result?: WaterStateResponse): WaterBaseline | undefined {
  if (!result) return undefined;
  const id = result.water_observation_id;
  const sequence = result.water_sequence;
  if (sequence === 0 && !id) return undefined;
  if (!id || !id.trim() || !Number.isInteger(sequence) || sequence <= 0) throw new Error("Canonical water lineage is internally inconsistent. Reload or explicitly recompute before continuing.");
  return { observationId: id, sequence };
}

export function buildWaterSemanticPayload(stateId: string, weather: AcceptedWeather, irrigation: LastIrrigationEvent | null, baseline?: WaterBaseline) {
  return {
    state_id: stateId,
    current_date: weather.targetDate,
    weather: weather.weather,
    last_irrigation_event: irrigation,
    ...(baseline ? { base_water_observation_id: baseline.observationId, base_water_sequence: baseline.sequence } : {}),
  };
}

export function waterPayloadSignature(payload: ReturnType<typeof buildWaterSemanticPayload>) { return canonicalJson(payload); }

export function buildComputeWaterRequest(payload: ReturnType<typeof buildWaterSemanticPayload>, waterUpdateId: string): ComputeWaterStateRequest {
  return { ...payload, water_update_id: waterUpdateId };
}

export function formatWaterNumber(value: number | null | undefined, unit = "") { return value === null || value === undefined ? "Not provided" : `${value.toFixed(2)}${unit}`; }
