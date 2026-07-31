"use client";

import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { workflowReducer } from "./workflow-reducer";
import {
  initialWorkflowState,
  type WorkflowAction,
  type WorkflowState,
} from "./workflow-types";

const WorkflowStateContext = createContext<WorkflowState | null>(null);
const WorkflowDispatchContext =
  createContext<React.Dispatch<WorkflowAction> | null>(null);

export function WorkflowProvider({
  children,
  initialState = initialWorkflowState,
}: {
  children: ReactNode;
  initialState?: WorkflowState;
}) {
  const [state, dispatch] = useReducer(workflowReducer, initialState);
  const memoizedState = useMemo(() => state, [state]);

  return (
    <WorkflowStateContext.Provider value={memoizedState}>
      <WorkflowDispatchContext.Provider value={dispatch}>
        {children}
      </WorkflowDispatchContext.Provider>
    </WorkflowStateContext.Provider>
  );
}

export function useWorkflowState(): WorkflowState {
  const state = useContext(WorkflowStateContext);
  if (state === null) {
    throw new Error("useWorkflowState must be used within WorkflowProvider.");
  }
  return state;
}

export function useWorkflowDispatch(): React.Dispatch<WorkflowAction> {
  const dispatch = useContext(WorkflowDispatchContext);
  if (dispatch === null) {
    throw new Error("useWorkflowDispatch must be used within WorkflowProvider.");
  }
  return dispatch;
}
