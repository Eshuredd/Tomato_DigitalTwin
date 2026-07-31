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
  water: WaterStateResponse | null;
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
  | { type: "weatherDraftChanged"; draft: WeatherInput }
  | { type: "waterInvalidated" }
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
  water: null,
  latestWaterObservationId: null,
  latestWaterSequence: 0,
};
