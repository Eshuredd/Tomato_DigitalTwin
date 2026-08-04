import type { AdvanceOneDayRequest, AdvanceOneDayResponse, UpdateTwinStateResponse, WaterStateResponse } from "@/lib/api/contracts";
import type { AdvancementTransitionKind, TwinRefreshStatus } from "./advancement/advancement-utils";

export interface AcceptedWaterResult {
  response: WaterStateResponse;
  sourceSignature: string;
  requestPayloadSignature: string;
  waterUpdateId: string;
  irrigationSemanticSignature: string;
  irrigationEventId?: string;
}

export interface AcceptedTwinResult { response: UpdateTwinStateResponse; sourceSignature: string }

export interface AcceptedAdvancementResult {
  response: AdvanceOneDayResponse;
  sourceSignature: string;
  advancementId: string;
  transition: AdvancementTransitionKind;
  status: "current" | "historical" | "partial";
  twinRefreshStatus: TwinRefreshStatus;
  request: AdvanceOneDayRequest;
}
