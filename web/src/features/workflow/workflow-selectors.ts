import type { SessionResponse, SessionStateResponse } from "@/lib/types/api";
import type { WorkflowState } from "./workflow-types";

export function selectActiveSessionSummary(state: WorkflowState) {
  const session = state.session;
  if (!state.activeStateId || !session) {
    return null;
  }
  return {
    stateId: state.activeStateId,
    cropType: session.crop_type,
    plantingDate: session.planting_date,
    locationName: session.location.name,
    soilTexture: session.soil_texture,
  };
}

export function isSessionStateResponse(
  session: SessionResponse | SessionStateResponse | null,
): session is SessionStateResponse {
  return Boolean(session && "current_state" in session);
}
