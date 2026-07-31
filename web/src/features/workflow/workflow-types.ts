import type {
  DiseasePredictionResponse,
  SessionResponse,
  SessionStateResponse,
  SystemInfoResponse,
  TwinCurrentState,
  UpdateTwinStateResponse,
  WaterStateResponse,
  WeatherInput,
  WeatherSnapshotResponse,
} from "@/lib/types/api";

export interface WorkflowState {
  activeStateId: string | null;
  session: SessionResponse | SessionStateResponse | null;
  loadedCurrentState: TwinCurrentState | null;
  systemInfo: SystemInfoResponse | null;
  disease: DiseasePredictionResponse | null;
  diseaseRequestPending: boolean;
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
}

export type WorkflowAction =
  | { type: "systemInfoLoaded"; systemInfo: SystemInfoResponse }
  | { type: "sessionCreated"; session: SessionResponse }
  | { type: "sessionLoaded"; session: SessionStateResponse }
  | { type: "sessionCleared" }
  | { type: "diseaseRequestStarted"; stateId: string }
  | { type: "diseaseRequestFinished"; stateId: string }
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
    };

export const initialWorkflowState: WorkflowState = {
  activeStateId: null,
  session: null,
  loadedCurrentState: null,
  systemInfo: null,
  disease: null,
  diseaseRequestPending: false,
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
};
