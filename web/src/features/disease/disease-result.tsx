import { DefinitionList } from "@/components/ui/definition-list";
import { Notice } from "@/components/ui/notice";
import { ProgressRow } from "@/components/ui/progress-row";
import { TechnicalDetails } from "@/components/ui/technical-details";
import type { DiseasePredictionResponse, SystemInfoResponse } from "@/lib/types/api";
import { formatPercent, humanizeDiseaseLabel, topClassProbabilities } from "./disease-utils";

export function DiseaseResult({
  modelInfo,
  result,
}: {
  modelInfo: SystemInfoResponse["disease_model"] | null;
  result: DiseasePredictionResponse;
}) {
  const readableLabel = humanizeDiseaseLabel(result.predicted_label);
  const isUnknown = result.predicted_label.trim().toUpperCase() === "UNKNOWN";
  const topClasses = topClassProbabilities(result.class_probs, 3);
  const modelBasis = optionalString(modelInfo?.basis) ?? optionalString(modelInfo?.training_basis);

  return (
    <div className="grid gap-5">
      <div>
        <h3 className="text-2xl font-semibold break-words">
          {isUnknown ? "Unknown evidence" : readableLabel}
        </h3>
        {isUnknown ? (
          <Notice tone="warning">
            The model did not have enough reliable evidence. Do not treat this
            as healthy; inspect the plant manually.
          </Notice>
        ) : null}
      </div>

      <DefinitionList
        items={[
          { term: "Disease category", description: result.disease_category },
          { term: "Calibrated confidence", description: formatPercent(result.confidence_calibrated) },
          { term: "Uncertainty score", description: `${formatPercent(result.uncertainty_score)} (${result.uncertainty_score})` },
          { term: "Uncertainty band", description: result.uncertainty_band },
          { term: "Model name", description: modelInfo?.model_name ?? "Not returned by disease response" },
          { term: "Model version", description: modelInfo?.model_version ?? "1.0" },
          { term: "Prediction timestamp", description: result.predicted_at },
          ...(modelBasis ? [{ term: "Model basis", description: modelBasis }] : []),
        ]}
      />

      {result.uncertainty_band === "high" ? (
        <Notice tone="warning">
          High uncertainty requires visual inspection before acting on this
          evidence.
        </Notice>
      ) : null}

      <div className="grid gap-2">
        <h4 className="text-base font-semibold">Top class probabilities</h4>
        {topClasses.length > 0 ? (
          <div className="grid gap-3">
            {topClasses.map(([label, probability]) => (
              <ProgressRow
                key={label}
                label={humanizeDiseaseLabel(label)}
                value={probability}
                valueLabel={formatPercent(probability)}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--color-muted)]">
            No class-probability map was returned.
          </p>
        )}
      </div>

      <div className="grid gap-3">
        <Notice>
          Disease evidence does not determine irrigation. CropTwin does not
          provide pesticide, fertiliser, or treatment instructions.
        </Notice>
        <Notice tone="warning">
          This result does not replace professional agronomic inspection.
        </Notice>
      </div>

      <TechnicalDetails
        json={{
          state_id: result.state_id,
          model_name: modelInfo?.model_name ?? null,
          model_version: modelInfo?.model_version ?? "1.0",
          predicted_at: result.predicted_at,
          confidence_calibrated: result.confidence_calibrated,
          uncertainty_score: result.uncertainty_score,
          uncertainty_band: result.uncertainty_band,
          model_basis: modelBasis ?? null,
          class_probs: result.class_probs,
        }}
      />
    </div>
  );
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
