import { CropTwinApiError } from "@/lib/api/errors";
import { canonicalTwinDecisionSignature } from "@/features/workflow/decision-signatures";
import type {
  ActionEnum,
  RecommendationResponse,
  SimulatedActionResult,
  SimulateActionsResponse,
  UpdateTwinStateResponse,
} from "@/lib/types/api";

export { canonicalTwinDecisionSignature };

export const ACTION_ORDER = [
  "IRRIGATE_NOW",
  "IRRIGATE_IN_6H",
  "IRRIGATE_TOMORROW_AM",
  "NO_IRRIGATION_24H",
] as const satisfies readonly ActionEnum[];

export const ACTION_LABELS: Record<ActionEnum, string> = {
  IRRIGATE_NOW: "Irrigate now",
  IRRIGATE_IN_6H: "Irrigate in 6 hours",
  IRRIGATE_TOMORROW_AM: "Irrigate tomorrow morning",
  NO_IRRIGATION_24H: "No irrigation for 24 hours",
};

export const IRRIGATION_CONSTRAINT_LABELS = {
  NONE: "No irrigation constraint",
  AVOID_OVERHEAD_IRRIGATION: "Avoid overhead irrigation",
  PREFER_EARLY_MORNING_WINDOW: "Prefer early morning irrigation",
} as const;

export const CAUTION_REASON_LABELS = {
  HIGH_UNCERTAINTY: "High uncertainty",
  FUNGAL_DISEASE_RISK: "Fungal disease risk",
} as const;

export function normalizeRequestedActions(actions: readonly ActionEnum[]): ActionEnum[] {
  assertNoDuplicateActions(actions, "Requested simulation actions contain duplicates.");
  const selected = new Set(actions);
  const normalized = ACTION_ORDER.filter((action) => selected.has(action));
  if (normalized.length === 0) {
    throw malformedDecisionError("Select at least one candidate action to simulate.");
  }
  return normalized;
}

export function simulationSourceSignature({
  actions,
  stateId,
  twin,
}: {
  actions: readonly ActionEnum[];
  stateId: string;
  twin: UpdateTwinStateResponse;
}): string {
  return stableStringify({
    actions: normalizeRequestedActions(actions),
    twin: canonicalTwinDecisionSignature({ stateId, twin }),
  });
}

export function recommendationSourceSignature({
  simulation,
  stateId,
  twin,
}: {
  simulation: SimulateActionsResponse;
  stateId: string;
  twin: UpdateTwinStateResponse;
}): string {
  return stableStringify({
    simulation: {
      state_id: simulation.state_id,
      simulated_at: simulation.simulated_at,
      simulations: simulation.simulations,
    },
    twin: canonicalTwinDecisionSignature({ stateId, twin }),
  });
}

export function validateSimulationForRequestedActions({
  expectedStateId,
  requestedActions,
  response,
}: {
  response: SimulateActionsResponse;
  requestedActions: readonly ActionEnum[];
  expectedStateId: string;
}): SimulateActionsResponse {
  if (response.state_id !== expectedStateId) {
    throw malformedDecisionError("The backend returned simulation data for a different session.");
  }
  const normalizedActions = normalizeRequestedActions(requestedActions);
  assertNoDuplicateActions(response.simulations.map((result) => result.action), "The backend returned a duplicate simulated action.");

  const byAction = new Map<ActionEnum, SimulatedActionResult>();
  for (const result of response.simulations) {
    byAction.set(result.action, result);
  }
  for (const action of normalizedActions) {
    if (!byAction.has(action)) {
      throw malformedDecisionError("The backend simulation omitted a requested action.");
    }
  }
  for (const action of byAction.keys()) {
    if (!normalizedActions.includes(action)) {
      throw malformedDecisionError("The backend simulation included an unexpected action.");
    }
  }
  return {
    ...response,
    simulations: normalizedActions.map((action) => byAction.get(action)!),
  };
}

export function validateRecommendationAgainstSimulation({
  expectedStateId,
  recommendation,
  simulation,
}: {
  recommendation: RecommendationResponse;
  simulation: SimulateActionsResponse;
  expectedStateId: string;
}): RecommendationResponse {
  if (recommendation.state_id !== expectedStateId || simulation.state_id !== expectedStateId) {
    throw malformedDecisionError("The backend returned recommendation data for a different session.");
  }
  if (simulation.simulations.length === 0) {
    throw malformedDecisionError("A recommendation requires at least one accepted simulation result.");
  }
  if (!simulation.simulations.some((result) => result.action === recommendation.chosen_action)) {
    throw malformedDecisionError("The backend recommended an action that was not in the accepted simulation.");
  }
  return recommendation;
}

export interface AcceptedSimulationSourceProof {
  actions: readonly ActionEnum[];
  simulation: SimulateActionsResponse;
  sourceSignature: string;
}

export function proveAcceptedSimulationSource({
  acceptedActions,
  acceptedSourceSignature,
  simulation,
  stateId,
  twin,
}: {
  acceptedActions: readonly ActionEnum[];
  acceptedSourceSignature: string | null;
  simulation: SimulateActionsResponse | null;
  stateId: string | null;
  twin: UpdateTwinStateResponse | null;
}): AcceptedSimulationSourceProof | null {
  if (
    !stateId ||
    !twin ||
    !simulation ||
    !acceptedSourceSignature ||
    acceptedActions.length === 0
  ) {
    return null;
  }
  try {
    const actions = normalizeRequestedActions(acceptedActions);
    const sourceSignature = simulationSourceSignature({ actions, stateId, twin });
    if (sourceSignature !== acceptedSourceSignature) {
      return null;
    }
    return {
      actions,
      simulation: validateSimulationForRequestedActions({
        expectedStateId: stateId,
        requestedActions: actions,
        response: simulation,
      }),
      sourceSignature,
    };
  } catch {
    return null;
  }
}

export function malformedDecisionError(message: string): CropTwinApiError {
  return new CropTwinApiError({
    kind: "malformed",
    status: null,
    code: "FRONTEND_MALFORMED_RESPONSE",
    message,
  });
}

function assertNoDuplicateActions(actions: readonly ActionEnum[], message: string): void {
  const seen = new Set<ActionEnum>();
  for (const action of actions) {
    if (seen.has(action)) {
      throw malformedDecisionError(message);
    }
    seen.add(action);
  }
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, sortValue(entryValue)]),
    );
  }
  return value;
}
