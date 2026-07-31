import { DefinitionList } from "@/components/ui/definition-list";
import { Notice } from "@/components/ui/notice";
import { TechnicalDetails } from "@/components/ui/technical-details";
import type { UpdateTwinStateResponse } from "@/lib/types/api";
import {
  formatTwinNumber,
  formatTwinPercent,
  snapshotStatusText,
} from "./twin-utils";

export function TwinResult({ result }: { result: UpdateTwinStateResponse }) {
  const current = result.current_state;
  const items = [
    { term: "Growth stage", description: current.growth_stage.replaceAll("_", " ") },
    { term: "Days since planting", description: current.days_since_planting },
    { term: "Predicted disease", description: current.predicted_label },
    { term: "Disease category", description: current.disease_category },
    { term: "Calibrated confidence", description: formatTwinPercent(current.confidence_calibrated) },
    { term: "Uncertainty band", description: current.uncertainty_band },
    { term: "ETo", description: formatTwinNumber(current.eto_computed, " mm") },
    { term: "ETc", description: formatTwinNumber(current.etc, " mm") },
    { term: "Root-zone depletion", description: formatTwinNumber(current.root_zone_depletion_mm, " mm") },
    { term: "Moisture state", description: current.estimated_moisture_state.replaceAll("_", " ") },
    { term: "Stress band", description: current.stress_band },
    { term: "Observed at", description: current.observed_at },
    { term: "Last update", description: current.last_update_time },
  ];
  if (current.water_surplus_mm > 0) {
    items.push({
      term: "Water surplus",
      description: formatTwinNumber(current.water_surplus_mm, " mm"),
    });
  }
  if (current.depletion_beyond_taw_mm > 0) {
    items.push({
      term: "Depletion beyond TAW",
      description: formatTwinNumber(current.depletion_beyond_taw_mm, " mm"),
    });
  }

  return (
    <div className="grid gap-5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
      <div>
        <h3 className="font-semibold">Canonical current twin</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
          The twin combines accepted disease evidence and deterministic water
          state. Disease remains supporting evidence; this step does not choose
          an irrigation action.
        </p>
        <DefinitionList className="mt-3" items={items} />
      </div>

      <Notice tone={result.snapshot_created ? "success" : "info"}>
        {snapshotStatusText(result)}
      </Notice>

      <Notice>
        Simulation and recommendation remain separate workflow steps.
      </Notice>

      <TechnicalDetails
        summary="Technical twin state"
        json={{
          state_id: result.state_id,
          snapshot_id: result.snapshot_id ?? null,
          snapshot_created: result.snapshot_created,
          state_history_count: result.state_history_count,
          crop_type: current.crop_type,
          growth_stage: current.growth_stage,
          days_since_planting: current.days_since_planting,
          predicted_label: current.predicted_label,
          disease_category: current.disease_category,
          confidence_calibrated: current.confidence_calibrated,
          uncertainty_score: current.uncertainty_score,
          uncertainty_band: current.uncertainty_band,
          eto_computed: current.eto_computed,
          eto_method: current.eto_method,
          kc: current.kc,
          etc: current.etc,
          taw: current.taw,
          raw_threshold: current.raw_threshold,
          raw_root_zone_depletion_mm: current.raw_root_zone_depletion_mm,
          root_zone_depletion_mm: current.root_zone_depletion_mm,
          root_zone_depletion: current.root_zone_depletion,
          water_surplus_mm: current.water_surplus_mm,
          depletion_beyond_taw_mm: current.depletion_beyond_taw_mm,
          estimated_moisture_state: current.estimated_moisture_state,
          stress_band: current.stress_band,
          observed_at: current.observed_at,
          computed_at: current.computed_at,
          observation_time_basis: current.observation_time_basis,
          last_update_time: current.last_update_time,
        }}
      />
    </div>
  );
}
