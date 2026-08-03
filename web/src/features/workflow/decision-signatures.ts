import type { UpdateTwinStateResponse } from "@/lib/types/api";

export function canonicalTwinDecisionSignature({
  stateId,
  twin,
}: {
  stateId: string;
  twin: UpdateTwinStateResponse;
}): string {
  return stableStringify({
    state_id: stateId,
    snapshot_id: twin.snapshot_id ?? null,
    current_state: {
      observed_at: twin.current_state.observed_at,
      computed_at: twin.current_state.computed_at,
      last_update_time: twin.current_state.last_update_time,
      growth_stage: twin.current_state.growth_stage,
      predicted_label: twin.current_state.predicted_label,
      disease_category: twin.current_state.disease_category,
      confidence_calibrated: twin.current_state.confidence_calibrated,
      uncertainty_score: twin.current_state.uncertainty_score,
      uncertainty_band: twin.current_state.uncertainty_band,
      eto_computed: twin.current_state.eto_computed,
      etc: twin.current_state.etc,
      taw: twin.current_state.taw,
      raw_threshold: twin.current_state.raw_threshold,
      root_zone_depletion: twin.current_state.root_zone_depletion,
      stress_band: twin.current_state.stress_band,
    },
  });
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
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
