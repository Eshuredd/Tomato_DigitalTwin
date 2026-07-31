import type {
  AdvanceOneDayRequest,
  AdvanceOneDayResponse,
  LastIrrigationEvent,
  UpdateTwinStateResponse,
  WeatherInput,
} from "@/lib/types/api";

export type AdvancementTransitionKind =
  | "new_advancement"
  | "catch_up_retry"
  | "current_retry"
  | "historical_retry"
  | "malformed_retry";

export type TwinRefreshStatus = "not_needed" | "succeeded" | "failed";

export interface AdvancementTransition {
  kind: AdvancementTransitionKind;
  replaceCanonicalWater: boolean;
  replaceTwinFromResponse: boolean;
  refreshAuthoritativeTwin: boolean;
  invalidateCurrentTwin: boolean;
  retainResponse: boolean;
  advanceNextDate: boolean;
  notice: string | null;
}

export const ADVANCEMENT_REUSED_NOTICE =
  "This daily advancement was already completed; reused the original result.";
export const ADVANCEMENT_CATCH_UP_NOTICE =
  "The advancement already existed. CropTwin refreshed the local workflow to the latest canonical state.";
export const ADVANCEMENT_CREATED_NOTICE =
  "Advanced the canonical twin by one day.";
export const ADVANCEMENT_TWIN_REFRESH_FAILED_NOTICE =
  "The canonical water state was updated, but CropTwin could not refresh the current twin. Retry the canonical twin update before advancing again.";

export function generateAdvancementId(): string {
  return crypto.randomUUID();
}

export function advancementPayloadSignature({
  irrigationEvent,
  stateId,
  targetDate,
  weather,
}: {
  irrigationEvent: LastIrrigationEvent | null;
  stateId: string;
  targetDate: string;
  weather: WeatherInput;
}): string {
  return JSON.stringify(sortValue({
    last_irrigation_event: irrigationEvent,
    state_id: stateId,
    target_date: targetDate,
    weather,
  }));
}

export function buildAdvanceOneDayRequest({
  advancementId,
  irrigationEvent,
  targetDate,
  weather,
}: {
  advancementId: string;
  irrigationEvent: LastIrrigationEvent | null;
  targetDate: string;
  weather: WeatherInput;
}): Omit<AdvanceOneDayRequest, "state_id"> {
  return {
    advancement_id: advancementId,
    target_date: targetDate,
    weather,
    last_irrigation_event: irrigationEvent,
  };
}

export function deriveNextAdvancementDate(observedAt: string): string | null {
  const match = observedAt.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (!match) {
    return null;
  }
  const [, yearText, monthText, dayText] = match;
  const date = new Date(Date.UTC(
    Number(yearText),
    Number(monthText) - 1,
    Number(dayText) + 1,
  ));
  return date.toISOString().slice(0, 10);
}

export function evaluateAdvancementTransition({
  advancementCreated,
  currentSequence,
  currentTwin,
  response,
}: {
  advancementCreated: unknown;
  currentSequence: unknown;
  currentTwin: UpdateTwinStateResponse | null;
  response: AdvanceOneDayResponse;
}): AdvancementTransition {
  const returnedSequence = strictSequence(response.water_state.water_sequence);
  const localSequence = strictSequence(currentSequence);

  if (advancementCreated === true) {
    return {
      kind: "new_advancement",
      replaceCanonicalWater: true,
      replaceTwinFromResponse: true,
      refreshAuthoritativeTwin: false,
      invalidateCurrentTwin: false,
      retainResponse: false,
      advanceNextDate: true,
      notice: ADVANCEMENT_CREATED_NOTICE,
    };
  }

  if (advancementCreated !== false || returnedSequence === null || localSequence === null) {
    return {
      kind: "malformed_retry",
      replaceCanonicalWater: false,
      replaceTwinFromResponse: false,
      refreshAuthoritativeTwin: false,
      invalidateCurrentTwin: false,
      retainResponse: true,
      advanceNextDate: false,
      notice: ADVANCEMENT_REUSED_NOTICE,
    };
  }

  if (returnedSequence > localSequence) {
    return {
      kind: "catch_up_retry",
      replaceCanonicalWater: true,
      replaceTwinFromResponse: false,
      refreshAuthoritativeTwin: true,
      invalidateCurrentTwin: true,
      retainResponse: false,
      advanceNextDate: true,
      notice: null,
    };
  }

  if (returnedSequence === localSequence) {
    return {
      kind: "current_retry",
      replaceCanonicalWater: false,
      replaceTwinFromResponse: false,
      refreshAuthoritativeTwin: currentTwin === null,
      invalidateCurrentTwin: currentTwin === null,
      retainResponse: true,
      advanceNextDate: false,
      notice: ADVANCEMENT_REUSED_NOTICE,
    };
  }

  return {
    kind: "historical_retry",
    replaceCanonicalWater: false,
    replaceTwinFromResponse: false,
    refreshAuthoritativeTwin: false,
    invalidateCurrentTwin: false,
    retainResponse: true,
    advanceNextDate: false,
    notice: ADVANCEMENT_REUSED_NOTICE,
  };
}

export function formatAdvancementTransition(kind: AdvancementTransitionKind | null): string {
  if (!kind) {
    return "Not run";
  }
  return kind.replaceAll("_", " ");
}

function strictSequence(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
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
