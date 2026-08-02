import type {
  AdvanceOneDayResponse,
  RecommendationResponse,
  DiseasePredictionResponse,
  SessionResponse,
  SessionStateResponse,
  SimulateActionsResponse,
  SystemInfoResponse,
  TwinCurrentState,
  UpdateTwinStateResponse,
  WaterStateResponse,
  WeatherInput,
  WeatherSnapshotResponse,
} from "@/lib/types/api";
import type {
  AdvancementTransitionKind,
  TwinRefreshStatus,
} from "./workflow-domain-types";

export interface WorkflowState {
  activeStateId: string | null;
  session: SessionResponse | SessionStateResponse | null;
  loadedCurrentState: TwinCurrentState | null;
  systemInfo: SystemInfoResponse | null;
  disease: DiseasePredictionResponse | null;
  diseaseRequestPending: boolean;
  activeDiseaseRequestId: string | null;
  weatherSnapshot: WeatherSnapshotResponse | null;
  weatherDraft: WeatherInput | null;
  weatherDate: string | null;
  water: WaterStateResponse | null;
  waterComputationPending: boolean;
  activeWaterRequestId: string | null;
  activeWaterRequestSignature: string | null;
  twin: UpdateTwinStateResponse | null;
  twinUpdatePending: boolean;
  activeTwinRequestId: string | null;
  activeTwinSourceSignature: string | null;
  latestWaterObservationId: string | null;
  latestWaterSequence: number;
  advancementPending: boolean;
  activeAdvancementRequestId: string | null;
  activeAdvancementRequestSignature: string | null;
  latestAdvancement: AdvanceOneDayResponse | null;
  retainedAdvancement: AdvanceOneDayResponse | null;
  advancementNotice: string | null;
  advancementTransitionKind: AdvancementTransitionKind | null;
  advancementTwinRefreshStatus: TwinRefreshStatus | null;
  simulation: SimulateActionsResponse | null;
  simulationPending: boolean;
  activeSimulationRequestId: string | null;
  activeSimulationSourceSignature: string | null;
  recommendation: RecommendationResponse | null;
  recommendationPending: boolean;
  activeRecommendationRequestId: string | null;
  activeRecommendationSourceSignature: string | null;
}

export type WorkflowAction =
  | { type: "systemInfoLoaded"; systemInfo: SystemInfoResponse }
  | { type: "sessionCreated"; session: SessionResponse }
  | { type: "sessionLoaded"; session: SessionStateResponse }
  | { type: "sessionCleared" }
  | { type: "diseaseRequestStarted"; stateId: string; requestId: string }
  | { type: "diseaseRequestFinished"; stateId: string; requestId: string }
  | {
      type: "diseaseReceived";
      stateId: string;
      disease: DiseasePredictionResponse;
    }
  | {
      type: "weatherSnapshotReceived";
      stateId: string;
      snapshot: WeatherSnapshotResponse;
      draft: WeatherInput;
    }
  | { type: "weatherDraftChanged"; stateId: string; draft: WeatherInput }
  | { type: "weatherDraftInvalidated"; stateId: string }
  | { type: "waterInvalidated"; stateId: string }
  | {
      type: "waterComputationStarted";
      stateId: string;
      requestId: string;
      signature: string;
    }
  | {
      type: "waterComputationFinished";
      stateId: string;
      requestId: string;
    }
  | {
      type: "waterReceived";
      stateId: string;
      water: WaterStateResponse;
    }
  | {
      type: "twinUpdateStarted";
      stateId: string;
      requestId: string;
      sourceSignature: string;
    }
  | {
      type: "twinUpdateFinished";
      stateId: string;
      requestId: string;
    }
  | {
      type: "twinReceived";
      stateId: string;
      twin: UpdateTwinStateResponse;
    }
  | {
      type: "twinInvalidated";
      stateId: string;
    }
  | {
      type: "advancementStarted";
      stateId: string;
      requestId: string;
      signature: string;
    }
  | {
      type: "advancementFinished";
      stateId: string;
      requestId: string;
    }
  | {
      type: "advancementApplied";
      stateId: string;
      requestId: string;
      response: AdvanceOneDayResponse;
      canonicalWater?: WaterStateResponse | null;
      canonicalTwin?: UpdateTwinStateResponse | null;
      retainedResponse: AdvanceOneDayResponse | null;
      notice: string | null;
      transitionKind: AdvancementTransitionKind;
      twinRefreshStatus: TwinRefreshStatus | null;
    }
  | {
      type: "simulationStarted";
      stateId: string;
      requestId: string;
      sourceSignature: string;
    }
  | {
      type: "simulationFinished";
      stateId: string;
      requestId: string;
    }
  | {
      type: "simulationReceived";
      stateId: string;
      requestId: string;
      simulation: SimulateActionsResponse;
    }
  | {
      type: "simulationInvalidated";
      stateId: string;
    }
  | {
      type: "recommendationStarted";
      stateId: string;
      requestId: string;
      sourceSignature: string;
    }
  | {
      type: "recommendationFinished";
      stateId: string;
      requestId: string;
    }
  | {
      type: "recommendationReceived";
      stateId: string;
      requestId: string;
      recommendation: RecommendationResponse;
    }
  | {
      type: "recommendationInvalidated";
      stateId: string;
    };

export const initialWorkflowState: WorkflowState = {
  activeStateId: null,
  session: null,
  loadedCurrentState: null,
  systemInfo: null,
  disease: null,
  diseaseRequestPending: false,
  activeDiseaseRequestId: null,
  weatherSnapshot: null,
  weatherDraft: null,
  weatherDate: null,
  water: null,
  waterComputationPending: false,
  activeWaterRequestId: null,
  activeWaterRequestSignature: null,
  twin: null,
  twinUpdatePending: false,
  activeTwinRequestId: null,
  activeTwinSourceSignature: null,
  latestWaterObservationId: null,
  latestWaterSequence: 0,
  advancementPending: false,
  activeAdvancementRequestId: null,
  activeAdvancementRequestSignature: null,
  latestAdvancement: null,
  retainedAdvancement: null,
  advancementNotice: null,
  advancementTransitionKind: null,
  advancementTwinRefreshStatus: null,
  simulation: null,
  simulationPending: false,
  activeSimulationRequestId: null,
  activeSimulationSourceSignature: null,
  recommendation: null,
  recommendationPending: false,
  activeRecommendationRequestId: null,
  activeRecommendationSourceSignature: null,
};
