import { DefinitionList } from "@/components/ui/definition-list";
import { Notice } from "@/components/ui/notice";
import { TechnicalDetails } from "@/components/ui/technical-details";
import type { SimulateActionsResponse } from "@/lib/types/api";
import type { JsonObject } from "@/lib/types/common";
import { ACTION_LABELS } from "./decision-utils";

export function SimulationResult({
  result,
}: {
  result: SimulateActionsResponse | null;
}) {
  if (!result) {
    return (
      <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
        <h3 className="font-semibold">No candidate projections yet</h3>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Results will appear after selected candidate actions are simulated by
          the backend.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
        <h3 className="font-semibold">Deterministic projection boundary</h3>
        <DefinitionList
          className="mt-3"
          items={[
            { term: "State ID", description: result.state_id },
            { term: "Simulated at", description: result.simulated_at },
            { term: "Returned actions", description: result.simulations.length },
          ]}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {result.simulations.map((simulation) => (
          <article
            className="min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4"
            key={simulation.action}
          >
            <h4 className="font-semibold">{ACTION_LABELS[simulation.action]}</h4>
            <p className="mt-1 break-words text-xs text-[var(--color-muted)]">
              {simulation.action}
            </p>
            <DefinitionList
              className="mt-3"
              items={[
                {
                  term: "Projected depletion",
                  description: `${simulation.projected_root_zone_depletion} mm`,
                },
                {
                  term: "RAW crossing",
                  description: simulation.projected_raw_crossing ? "yes" : "no",
                },
                {
                  term: "Stress band",
                  description: simulation.projected_stress_band,
                },
                {
                  term: "Projected water use",
                  description: `${simulation.projected_water_use} mm`,
                },
                {
                  term: "Wetness risk note",
                  description: simulation.disease_wetness_risk_note,
                },
              ]}
            />
          </article>
        ))}
      </div>
      <Notice>
        These are backend projections for the submitted actions, not a selected
        recommendation.
      </Notice>
      <TechnicalDetails
        summary="Simulation response"
        json={result as unknown as JsonObject}
      />
    </div>
  );
}
