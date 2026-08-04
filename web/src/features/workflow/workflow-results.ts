import type { AdvanceOneDayRequest, AdvanceOneDayResponse, NarrationResponse, RecommendationResponse, SimulateActionsResponse, UpdateTwinStateResponse, WaterStateResponse } from "@/lib/api/contracts";
import type { AdvancementTransitionKind, TwinRefreshStatus } from "./advancement/advancement-utils";

interface AcceptedWaterBase {
  response: WaterStateResponse;
  canonicalSourceId: string;
  evidenceAcceptanceId: string;
}

export interface AcceptedComputedWaterResult extends AcceptedWaterBase {
  origin: "compute";
  sourceSignature: string;
  requestPayloadSignature: string;
  waterUpdateId: string;
  irrigationSemanticSignature: string;
  irrigationEventId?: string;
}

export interface AcceptedAdvancedWaterResult extends AcceptedWaterBase {
  origin: "advancement";
  sourceSignature: string;
  advancementId: string;
  advancementTransition: AdvancementTransitionKind;
  advancementTargetDate: string;
  advancementIrrigationEventId?: string;
}

export type AcceptedWaterResult = AcceptedComputedWaterResult | AcceptedAdvancedWaterResult;

export interface AcceptedTwinResult { response: UpdateTwinStateResponse; sourceSignature: string }
export interface AcceptedSimulationResult { response: SimulateActionsResponse; sourceSignature: string; twinSourceSignature: string }
export interface AcceptedRecommendationResult { response: RecommendationResponse; sourceSignature: string }
export interface AcceptedNarrationResult { response: NarrationResponse; sourceSignature: string }

export interface AcceptedAdvancementResult {
  response: AdvanceOneDayResponse;
  sourceSignature: string;
  advancementId: string;
  transition: AdvancementTransitionKind;
  status: "current" | "historical" | "partial";
  twinRefreshStatus: TwinRefreshStatus;
  request: AdvanceOneDayRequest;
}
