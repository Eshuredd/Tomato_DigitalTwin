import type { DiseasePrediction, WaterStateResponse } from "@/lib/api/contracts";
import { canonicalJson } from "../identity";

export function twinSourceSignature(stateId: string, disease: DiseasePrediction, water: WaterStateResponse) {
  return canonicalJson({
    disease: { state_id: stateId, predicted_label: disease.predicted_label, disease_category: disease.disease_category, confidence_calibrated: disease.confidence_calibrated, uncertainty_score: disease.uncertainty_score, uncertainty_band: disease.uncertainty_band, predicted_at: disease.predicted_at, class_probs: disease.class_probs },
    water: { state_id: stateId, water_observation_id: water.water_observation_id, water_sequence: water.water_sequence, water_update_id: water.water_update_id },
  });
}
