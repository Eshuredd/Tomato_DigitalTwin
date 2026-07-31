import type {
  DiseasePredictionResponse,
  SessionResponse,
  SessionStateResponse,
  SystemInfoResponse,
  WaterStateResponse,
  WeatherInput,
  WeatherSnapshotResponse,
} from "@/lib/types/api";

export interface WorkflowState {
  activeStateId: string | null;
  session: SessionResponse | SessionStateResponse | null;
  systemInfo: SystemInfoResponse | null;
  disease: DiseasePredictionResponse | null;
  weatherSnapshot: WeatherSnapshotResponse | null;
  weatherDraft: WeatherInput | null;
  weatherDate: string | null;
  water: WaterStateResponse | null;
  waterComputationPending: boolean;
  activeWaterRequestId: string | null;
  activeWaterRequestSignature: string | null;
  latestWaterObservationId: string | null;
  latestWaterSequence: number;
}

export type WorkflowAction =
  | { type: "systemInfoLoaded"; systemInfo: SystemInfoResponse }
  | { type: "sessionCreated"; session: SessionResponse }
  | { type: "sessionLoaded"; session: SessionStateResponse }
  | { type: "sessionCleared" }
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
    };

export const initialWorkflowState: WorkflowState = {
  activeStateId: null,
  session: null,
  systemInfo: null,
  disease: null,
  weatherSnapshot: null,
  weatherDraft: null,
  weatherDate: null,
  water: null,
  waterComputationPending: false,
  activeWaterRequestId: null,
  activeWaterRequestSignature: null,
  latestWaterObservationId: null,
  latestWaterSequence: 0,
};
