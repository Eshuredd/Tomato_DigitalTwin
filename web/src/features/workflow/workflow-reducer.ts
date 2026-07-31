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
    case "sessionCreated":
      return {
        ...state,
        activeStateId: action.session.state_id,
        session: action.session,
        disease: null,
      };
    case "sessionLoaded": {
      const sameState = state.activeStateId === action.session.state_id;
      return {
        ...state,
        activeStateId: action.session.state_id,
        session: action.session,
        disease: sameState ? state.disease : null,
      };
    }
    case "sessionCleared":
      return initialWorkflowState;
    case "diseaseReceived":
      if (state.activeStateId !== action.stateId) {
        return state;
      }
      return {
        ...state,
        disease: action.disease,
      };
    default:
      return state;
  }
}
