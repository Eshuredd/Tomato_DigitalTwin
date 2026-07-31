import { DefinitionList } from "@/components/ui/definition-list";
import { Notice } from "@/components/ui/notice";
import { TechnicalDetails } from "@/components/ui/technical-details";
import type { WaterStateResponse } from "@/lib/types/api";
import { formatWaterNumber } from "./water-utils";

export function WaterResult({ result }: { result: WaterStateResponse }) {
  return (
    <div className="grid gap-5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
      <div>
        <h3 className="font-semibold">Deterministic water state</h3>
        <DefinitionList
          className="mt-3"
          items={[
            { term: "ETo", description: formatWaterNumber(result.eto_computed, " mm") },
            { term: "ETo method", description: result.eto_method.replaceAll("_", " ") },
            { term: "Kc", description: formatWaterNumber(result.kc) },
            { term: "ETc", description: formatWaterNumber(result.etc, " mm") },
            { term: "TAW", description: formatWaterNumber(result.taw, " mm") },
            { term: "RAW threshold", description: formatWaterNumber(result.raw_threshold, " mm") },
            { term: "Root-zone depletion", description: formatWaterNumber(result.root_zone_depletion_mm, " mm") },
            { term: "Moisture state", description: result.estimated_moisture_state.replaceAll("_", " ") },
            { term: "Stress band", description: result.stress_band },
            { term: "Effective irrigation", description: formatWaterNumber(result.effective_irrigation_mm, " mm") },
            { term: "Observed at", description: result.observed_at },
            { term: "Computed at", description: result.computed_at },
            { term: "Water sequence", description: result.water_sequence },
          ]}
        />
      </div>
      {result.irrigation_event_already_accounted_for ? (
        <Notice tone="warning">
          The reported irrigation event was already accounted for; the backend
          applied 0.00 mm from that event in this computation.
        </Notice>
      ) : null}
      <TechnicalDetails
        summary="Technical water lineage"
        json={{
          state_id: result.state_id,
          water_observation_id: result.water_observation_id ?? null,
          water_sequence: result.water_sequence,
          water_update_id: result.water_update_id ?? null,
          base_water_observation_id: result.base_water_observation_id ?? null,
          base_water_sequence: result.base_water_sequence,
          previous_root_zone_depletion_mm: result.previous_root_zone_depletion_mm,
          reported_irrigation_event_id: result.reported_irrigation_event_id ?? null,
          applied_irrigation_event_id: result.applied_irrigation_event_id ?? null,
          effective_irrigation_mm: result.effective_irrigation_mm,
          irrigation_event_already_accounted_for:
            result.irrigation_event_already_accounted_for,
          observed_at: result.observed_at,
          computed_at: result.computed_at,
          observation_time_basis: result.observation_time_basis,
        }}
      />
    </div>
  );
}
