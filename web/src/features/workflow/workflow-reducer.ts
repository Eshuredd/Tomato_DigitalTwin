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
        activeDiseaseRequestId: action.requestId,
      };
    case "diseaseRequestFinished":
      if (
        state.activeStateId !== action.stateId ||
        state.activeDiseaseRequestId !== action.requestId
      ) {
        return state;
      }
      return {
        ...state,
        diseaseRequestPending: false,
        activeDiseaseRequestId: null,
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
        activeDiseaseRequestId: null,
        twin: null,
        twinUpdatePending: false,
        activeTwinRequestId: null,
        activeTwinSourceSignature: null,
        ...clearAdvancementLocalState(),
        ...clearDecisionLocalState(),
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
        ...clearAdvancementLocalState(),
      };
    case "weatherDraftChanged":
      if (state.activeStateId !== action.stateId) {
        return state;
      }
      return {
        ...state,
        weatherDraft: action.draft,
        water: null,
        ...clearAdvancementLocalState(),
      };
    case "weatherDraftInvalidated":
      if (state.activeStateId !== action.stateId) {
        return state;
      }
      return {
        ...state,
        weatherDraft: null,
        water: null,
        ...clearAdvancementLocalState(),
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
        ...clearAdvancementLocalState(),
        ...clearDecisionLocalState(),
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
        ...clearAdvancementLocalState(),
        ...clearDecisionLocalState(),
      };
    case "twinInvalidated":
      if (state.activeStateId !== action.stateId) {
        return state;
      }
      return {
        ...state,
        twin: null,
        ...clearAdvancementLocalState(),
        ...clearDecisionLocalState(),
      };
    case "advancementStarted":
      if (state.activeStateId !== action.stateId) {
        return state;
      }
      return {
        ...state,
        advancementPending: true,
        activeAdvancementRequestId: action.requestId,
        activeAdvancementRequestSignature: action.signature,
        advancementNotice: null,
      };
    case "advancementFinished":
      if (
        state.activeStateId !== action.stateId ||
        state.activeAdvancementRequestId !== action.requestId
      ) {
        return state;
      }
      return {
        ...state,
        advancementPending: false,
        activeAdvancementRequestId: null,
        activeAdvancementRequestSignature: null,
      };
    case "advancementApplied":
      if (
        state.activeStateId !== action.stateId ||
        state.activeAdvancementRequestId !== action.requestId ||
        action.response.state_id !== action.stateId
      ) {
        return state;
      }
      return {
        ...state,
        water: Object.hasOwn(action, "canonicalWater")
          ? action.canonicalWater ?? null
          : state.water,
        latestWaterObservationId: action.canonicalWater
          ? action.canonicalWater.water_observation_id ?? null
          : state.latestWaterObservationId,
        latestWaterSequence: action.canonicalWater
          ? action.canonicalWater.water_sequence
          : state.latestWaterSequence,
        twin: Object.hasOwn(action, "canonicalTwin")
          ? action.canonicalTwin ?? null
          : state.twin,
        advancementPending: false,
        activeAdvancementRequestId: null,
        activeAdvancementRequestSignature: null,
        latestAdvancement: action.canonicalWater ? action.response : state.latestAdvancement,
        retainedAdvancement: action.retainedResponse,
        advancementNotice: action.notice,
        advancementTransitionKind: action.transitionKind,
        advancementTwinRefreshStatus: action.twinRefreshStatus,
        ...(action.canonicalTwin ? clearDecisionLocalState() : {}),
      };
    case "simulationStarted":
      if (state.activeStateId !== action.stateId) {
        return state;
      }
      return {
        ...state,
        simulationPending: true,
        activeSimulationRequestId: action.requestId,
        activeSimulationSourceSignature: action.sourceSignature,
      };
    case "simulationFinished":
      if (
        state.activeStateId !== action.stateId ||
        state.activeSimulationRequestId !== action.requestId
      ) {
        return state;
      }
      return {
        ...state,
        simulationPending: false,
        activeSimulationRequestId: null,
        activeSimulationSourceSignature: null,
      };
    case "simulationReceived":
      if (
        state.activeStateId !== action.stateId ||
        state.activeSimulationRequestId !== action.requestId ||
        action.simulation.state_id !== action.stateId
      ) {
        return state;
      }
      return {
        ...state,
        simulation: action.simulation,
        simulationPending: false,
        activeSimulationRequestId: null,
        activeSimulationSourceSignature: null,
        ...clearRecommendationLocalState(),
      };
    case "simulationInvalidated":
      if (state.activeStateId !== action.stateId) {
        return state;
      }
      return {
        ...state,
        ...clearDecisionLocalState(),
      };
    case "recommendationStarted":
      if (state.activeStateId !== action.stateId) {
        return state;
      }
      return {
        ...state,
        recommendationPending: true,
        activeRecommendationRequestId: action.requestId,
        activeRecommendationSourceSignature: action.sourceSignature,
      };
    case "recommendationFinished":
      if (
        state.activeStateId !== action.stateId ||
        state.activeRecommendationRequestId !== action.requestId
      ) {
        return state;
      }
      return {
        ...state,
        recommendationPending: false,
        activeRecommendationRequestId: null,
        activeRecommendationSourceSignature: null,
      };
    case "recommendationReceived":
      if (
        state.activeStateId !== action.stateId ||
        state.activeRecommendationRequestId !== action.requestId ||
        action.recommendation.state_id !== action.stateId
      ) {
        return state;
      }
      return {
        ...state,
        recommendation: action.recommendation,
        recommendationPending: false,
        activeRecommendationRequestId: null,
        activeRecommendationSourceSignature: null,
      };
    case "recommendationInvalidated":
      if (state.activeStateId !== action.stateId) {
        return state;
      }
      return {
        ...state,
        ...clearRecommendationLocalState(),
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
    ...clearAdvancementLocalState(),
    ...clearDecisionLocalState(),
  };
}

function clearAdvancementLocalState() {
  return {
    advancementPending: false,
    activeAdvancementRequestId: null,
    activeAdvancementRequestSignature: null,
    latestAdvancement: null,
    retainedAdvancement: null,
    advancementNotice: null,
    advancementTransitionKind: null,
    advancementTwinRefreshStatus: null,
  } satisfies Pick<
    WorkflowState,
    | "advancementPending"
    | "activeAdvancementRequestId"
    | "activeAdvancementRequestSignature"
    | "latestAdvancement"
    | "retainedAdvancement"
    | "advancementNotice"
    | "advancementTransitionKind"
    | "advancementTwinRefreshStatus"
  >;
}

function clearDecisionLocalState() {
  return {
    simulation: null,
    simulationPending: false,
    activeSimulationRequestId: null,
    activeSimulationSourceSignature: null,
    ...clearRecommendationLocalState(),
  } satisfies Pick<
    WorkflowState,
    | "simulation"
    | "simulationPending"
    | "activeSimulationRequestId"
    | "activeSimulationSourceSignature"
    | "recommendation"
    | "recommendationPending"
    | "activeRecommendationRequestId"
    | "activeRecommendationSourceSignature"
  >;
}

function clearRecommendationLocalState() {
  return {
    recommendation: null,
    recommendationPending: false,
    activeRecommendationRequestId: null,
    activeRecommendationSourceSignature: null,
  } satisfies Pick<
    WorkflowState,
    | "recommendation"
    | "recommendationPending"
    | "activeRecommendationRequestId"
    | "activeRecommendationSourceSignature"
  >;
}
