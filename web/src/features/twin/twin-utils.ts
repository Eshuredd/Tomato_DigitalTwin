import type {
  DiseasePredictionResponse,
  UpdateTwinStateResponse,
  WaterStateResponse,
} from "@/lib/types/api";

export function twinSourceSignature({
  disease,
  stateId,
  water,
}: {
  disease: DiseasePredictionResponse;
  stateId: string;
  water: WaterStateResponse;
}): string {
  return JSON.stringify(sortValue({
    disease: {
      class_probs: disease.class_probs,
      confidence_calibrated: disease.confidence_calibrated,
      crop_type: disease.crop_type,
      disease_category: disease.disease_category,
      predicted_at: disease.predicted_at,
      predicted_label: disease.predicted_label,
      state_id: disease.state_id,
      uncertainty_band: disease.uncertainty_band,
      uncertainty_score: disease.uncertainty_score,
    },
    state_id: stateId,
    water: {
      state_id: water.state_id,
      water_observation_id: water.water_observation_id ?? null,
      water_sequence: water.water_sequence,
      water_update_id: water.water_update_id ?? null,
    },
  }));
}

export function formatTwinNumber(value: number, suffix = ""): string {
  return `${value.toFixed(2)}${suffix}`;
}

export function formatTwinPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function snapshotStatusText(result: UpdateTwinStateResponse): string {
  return result.snapshot_created
    ? "A new canonical twin snapshot was created."
    : "The canonical twin already reflected the latest accepted observations.";
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
