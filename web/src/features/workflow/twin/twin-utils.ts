import { canonicalJson } from "../identity";

export function twinSourceSignature(stateId: string, evidenceAcceptanceId: string, canonicalWaterSourceId: string) {
  return canonicalJson({
    state_id: stateId,
    evidence_acceptance_id: evidenceAcceptanceId,
    canonical_water_source_id: canonicalWaterSourceId,
  });
}
