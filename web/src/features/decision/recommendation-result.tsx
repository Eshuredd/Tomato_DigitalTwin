import { DefinitionList } from "@/components/ui/definition-list";
import { Notice } from "@/components/ui/notice";
import { TechnicalDetails } from "@/components/ui/technical-details";
import type { RecommendationResponse } from "@/lib/types/api";
import type { JsonObject } from "@/lib/types/common";
import {
  ACTION_LABELS,
  CAUTION_REASON_LABELS,
} from "./decision-utils";

export function RecommendationResult({
  result,
}: {
  result: RecommendationResponse | null;
}) {
  if (!result) {
    return (
      <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
        <h3 className="font-semibold">No recommendation yet</h3>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Generate a deterministic recommendation after accepting a simulation.
        </p>
      </div>
    );
  }

  const constraintText = {
    NONE: "No additional irrigation-method constraint was returned.",
    AVOID_OVERHEAD_IRRIGATION: "Avoid overhead irrigation.",
    PREFER_EARLY_MORNING_WINDOW: "Prefer an early-morning irrigation window.",
  }[result.irrigation_constraint];

  return (
    <div className="grid gap-4">
      <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
        <h3 className="font-semibold">Backend-selected action</h3>
        <DefinitionList
          className="mt-3"
          items={[
            { term: "Chosen action", description: ACTION_LABELS[result.chosen_action] },
            { term: "Action value", description: result.chosen_action },
            {
              term: "Irrigation constraint",
              description: constraintText,
            },
            {
              term: "Inspection advisory",
              description: result.inspection_advisory
                ? "Field inspection is advised; disease is not confirmed by this output."
                : "No inspection advisory was returned.",
            },
            { term: "Recommended at", description: result.recommended_at },
            { term: "Recommendation ID", description: result.recommendation_id ?? "None" },
          ]}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
          <h4 className="font-semibold">Decision reason codes</h4>
          {result.decision_reason_codes.length > 0 ? (
            <ul className="mt-3 grid gap-2 text-sm text-[var(--color-muted)]">
              {result.decision_reason_codes.map((code, index) => (
                <li className="break-words" key={`${code}-${index}`}>{code}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-[var(--color-muted)]">None returned.</p>
          )}
        </div>
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
          <h4 className="font-semibold">Cautions</h4>
          {result.caution_reasons.length > 0 ? (
            <ul className="mt-3 grid gap-2 text-sm text-[var(--color-muted)]">
              {result.caution_reasons.map((reason) => (
                <li className="break-words" key={reason}>
                  {cautionText(reason)} ({reason})
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-[var(--color-muted)]">None returned.</p>
          )}
        </div>
      </div>
      <Notice>
        FastAPI&apos;s deterministic recommendation engine selected the action. The
        browser did not rank or choose an action.
      </Notice>
      <Notice>
        Disease evidence may constrain irrigation timing or irrigation method.
        Disease evidence does not replace deterministic water-state logic.
      </Notice>
      <Notice tone="warning">
        This output is not pesticide, fertiliser or disease-treatment advice.
        Farmer-readable narration remains a separate workflow stage.
      </Notice>
      <TechnicalDetails
        summary="Recommendation response"
        json={result as unknown as JsonObject}
      />
    </div>
  );
}

function cautionText(reason: keyof typeof CAUTION_REASON_LABELS): string {
  if (reason === "HIGH_UNCERTAINTY") {
    return "Disease evidence has high uncertainty; this is not a diagnosis.";
  }
  return "Wetness-sensitive fungal-risk evidence influenced the constraint; no treatment advice is provided.";
}
