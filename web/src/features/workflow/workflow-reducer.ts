import {
  initialWorkflowState,
  type WorkflowAction,
  type WorkflowState,
} from "./workflow-types";

export function workflowReducer(
  state: WorkflowState,
  action: WorkflowAction,
): WorkflowState {
  switch (action.type) {
    case "systemInfoLoaded":
      return {
        ...state,
        systemInfo: action.systemInfo,
      };
    case "sessionCreated":
      return {
        ...clearActiveSessionData(state),
        activeStateId: action.session.state_id,
        session: action.session,
      };
    case "sessionLoaded": {
      const sameState = state.activeStateId === action.session.state_id;
      return {
        ...(sameState ? state : clearActiveSessionData(state)),
        activeStateId: action.session.state_id,
        session: action.session,
      };
    }
    case "sessionCleared":
      return {
        ...initialWorkflowState,
        systemInfo: state.systemInfo,
      };
    case "diseaseReceived":
      if (
        state.activeStateId !== action.stateId ||
        action.disease.state_id !== action.stateId
      ) {
        return state;
      }
      return {
        ...state,
        disease: action.disease,
      };
    case "weatherSnapshotReceived":
      if (
        state.activeStateId !== action.stateId ||
        action.snapshot.state_id !== action.stateId
      ) {
        return state;
      }
      return {
        ...state,
        weatherSnapshot: action.snapshot,
        weatherDraft: action.draft,
        water: null,
      };
    case "weatherDraftChanged":
      return {
        ...state,
        weatherDraft: action.draft,
        water: null,
      };
    case "waterInvalidated":
      return {
        ...state,
        water: null,
      };
    case "waterReceived":
      if (
        state.activeStateId !== action.stateId ||
        action.water.state_id !== action.stateId
      ) {
        return state;
      }
      return {
        ...state,
        water: action.water,
        latestWaterObservationId: action.water.water_observation_id ?? null,
        latestWaterSequence: action.water.water_sequence,
      };
    default:
      return state;
  }
}

function clearActiveSessionData(state: WorkflowState): WorkflowState {
  return {
    ...state,
    activeStateId: null,
    session: null,
    disease: null,
    weatherSnapshot: null,
    weatherDraft: null,
    water: null,
    latestWaterObservationId: null,
    latestWaterSequence: 0,
  };
}
