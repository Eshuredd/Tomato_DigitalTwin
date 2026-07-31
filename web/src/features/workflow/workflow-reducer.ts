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
        loadedCurrentState: null,
      };
    case "sessionLoaded": {
      const sameState = state.activeStateId === action.session.state_id;
      return {
        ...(sameState ? state : clearActiveSessionData(state)),
        activeStateId: action.session.state_id,
        session: action.session,
        loadedCurrentState: action.session.current_state,
      };
    }
    case "sessionCleared":
      return {
        ...initialWorkflowState,
        systemInfo: state.systemInfo,
      };
    case "diseaseRequestStarted":
      if (state.activeStateId !== action.stateId) {
        return state;
      }
      return {
        ...state,
        diseaseRequestPending: true,
      };
    case "diseaseRequestFinished":
      if (state.activeStateId !== action.stateId) {
        return state;
      }
      return {
        ...state,
        diseaseRequestPending: false,
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
        diseaseRequestPending: false,
        twin: null,
        twinUpdatePending: false,
        activeTwinRequestId: null,
        activeTwinSourceSignature: null,
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
        weatherDate: action.snapshot.target_date,
        water: null,
      };
    case "weatherDraftChanged":
      if (state.activeStateId !== action.stateId) {
        return state;
      }
      return {
        ...state,
        weatherDraft: action.draft,
        water: null,
      };
    case "weatherDraftInvalidated":
      if (state.activeStateId !== action.stateId) {
        return state;
      }
      return {
        ...state,
        weatherDraft: null,
        water: null,
      };
    case "waterInvalidated":
      if (state.activeStateId !== action.stateId) {
        return state;
      }
      return {
        ...state,
        water: null,
      };
    case "waterComputationStarted":
      if (state.activeStateId !== action.stateId) {
        return state;
      }
      return {
        ...state,
        waterComputationPending: true,
        activeWaterRequestId: action.requestId,
        activeWaterRequestSignature: action.signature,
      };
    case "waterComputationFinished":
      if (
        state.activeStateId !== action.stateId ||
        state.activeWaterRequestId !== action.requestId
      ) {
        return state;
      }
      return {
        ...state,
        waterComputationPending: false,
        activeWaterRequestId: null,
        activeWaterRequestSignature: null,
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
        waterComputationPending: false,
        activeWaterRequestId: null,
        activeWaterRequestSignature: null,
        twin: null,
        twinUpdatePending: false,
        activeTwinRequestId: null,
        activeTwinSourceSignature: null,
        latestWaterObservationId: action.water.water_observation_id ?? null,
        latestWaterSequence: action.water.water_sequence,
      };
    case "twinUpdateStarted":
      if (state.activeStateId !== action.stateId) {
        return state;
      }
      return {
        ...state,
        twinUpdatePending: true,
        activeTwinRequestId: action.requestId,
        activeTwinSourceSignature: action.sourceSignature,
      };
    case "twinUpdateFinished":
      if (
        state.activeStateId !== action.stateId ||
        state.activeTwinRequestId !== action.requestId
      ) {
        return state;
      }
      return {
        ...state,
        twinUpdatePending: false,
        activeTwinRequestId: null,
        activeTwinSourceSignature: null,
      };
    case "twinReceived":
      if (
        state.activeStateId !== action.stateId ||
        action.twin.state_id !== action.stateId
      ) {
        return state;
      }
      return {
        ...state,
        twin: action.twin,
        twinUpdatePending: false,
        activeTwinRequestId: null,
        activeTwinSourceSignature: null,
      };
    case "twinInvalidated":
      if (state.activeStateId !== action.stateId) {
        return state;
      }
      return {
        ...state,
        twin: null,
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
    loadedCurrentState: null,
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
}
