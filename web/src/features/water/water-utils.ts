import type {
  ComputeWaterStateRequest,
  LastIrrigationEvent,
  WeatherInput,
} from "@/lib/types/api";

export function generateWaterUpdateId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `water-${Date.now()}-${Math.random()}`;
}

export function waterUpdatePayloadSignature({
  payload,
  stateId,
}: {
  payload: Omit<ComputeWaterStateRequest, "state_id" | "water_update_id">;
  stateId: string;
}): string {
  return JSON.stringify(sortValue({ payload, state_id: stateId }));
}

export function buildComputeWaterRequest({
  baseWaterObservationId,
  currentDate,
  lastIrrigationEvent,
  latestWaterSequence,
  waterUpdateId,
  weather,
}: {
  baseWaterObservationId: string | null;
  currentDate: string;
  lastIrrigationEvent: LastIrrigationEvent | null;
  latestWaterSequence: number;
  waterUpdateId: string;
  weather: WeatherInput;
}): Omit<ComputeWaterStateRequest, "state_id"> {
  const request: Omit<ComputeWaterStateRequest, "state_id"> = {
    water_update_id: waterUpdateId,
    current_date: currentDate,
    weather,
    last_irrigation_event: lastIrrigationEvent,
  };
  if (latestWaterSequence > 0 && baseWaterObservationId) {
    request.base_water_observation_id = baseWaterObservationId;
    request.base_water_sequence = latestWaterSequence;
  }
  return request;
}

export function formatWaterNumber(value: number | null | undefined, suffix = ""): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }
  return `${value.toFixed(2)}${suffix}`;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, sortValue(entryValue)]),
    );
  }
  return value;
}
