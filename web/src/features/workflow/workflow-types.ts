import type {
  DiseasePredictionResponse,
  SessionResponse,
  SessionStateResponse,
} from "@/lib/types/api";

export interface WorkflowState {
  activeStateId: string | null;
  session: SessionResponse | SessionStateResponse | null;
  disease: DiseasePredictionResponse | null;
}

export type WorkflowAction =
  | { type: "sessionCreated"; session: SessionResponse }
  | { type: "sessionLoaded"; session: SessionStateResponse }
  | { type: "sessionCleared" }
  | {
      type: "diseaseReceived";
      stateId: string;
      disease: DiseasePredictionResponse;
    };

export const initialWorkflowState: WorkflowState = {
  activeStateId: null,
  session: null,
  disease: null,
};
