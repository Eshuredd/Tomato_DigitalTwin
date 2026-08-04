import { AsyncStatePanel } from "./async-state-panel";
import { CropTwinApiError } from "@/lib/api/errors";

const codeCopy: Record<string, string> = {
  FASTAPI_VALIDATION_ERROR: "Some submitted values were rejected by FastAPI.",
  STATE_NOT_FOUND: "The requested farm, plot, or session was not found.",
  FARM_NOT_FOUND: "The requested farm was not found.",
  PLOT_NOT_FOUND: "The requested plot was not found.",
  MISSING_CACHED_OUTPUT: "The session exists, but its current twin state has not been computed yet.",
  INVALID_DISEASE_REQUEST: "The disease request did not match the supported contract.",
  STATE_ID_MISMATCH: "The workflow state ID did not match the disease request.",
  UNSUPPORTED_DISEASE_MODEL_VERSION: "The selected disease model version is not supported by FastAPI.",
  INVALID_DISEASE_IMAGE: "FastAPI could not decode or validate this leaf image.",
  DISEASE_MODEL_UNAVAILABLE: "The disease evidence model is currently unavailable.",
  DISEASE_INFERENCE_FAILED: "The disease evidence model could not complete this prediction.",
  INVALID_WEATHER_REQUEST: "The weather request did not match the supported contract.",
  WEATHER_LOOKUP_FAILED: "The weather provider could not return a snapshot for this date and location.",
  RESPONSE_STATE_ID_MISMATCH: "FastAPI returned data for a different workflow state.",
  WEATHER_DATE_MISMATCH: "FastAPI returned weather for a different target date.",
  INVALID_WATER_STATE_REQUEST: "The deterministic water request did not match the supported contract.",
  SESSION_ELEVATION_MISSING: "The session needs authoritative elevation before deterministic water computation.",
  WATER_UPDATE_CONFLICT: "This water update ID is already associated with a different semantic payload.",
  IRRIGATION_EVENT_APPLICATION_CONFLICT: "The irrigation event could not be applied consistently to this water lineage.",
  IRRIGATION_EVENT_ALREADY_APPLIED: "FastAPI reports that this physical irrigation event was already applied.",
  STALE_WATER_BASELINE: "The canonical water lineage advanced after this request was prepared. Review the supplied and current lineage before rebasing.",
  WATER_BASELINE_MISMATCH: "The supplied water observation and sequence do not identify the same canonical baseline.",
  OUT_OF_ORDER_WATER_OBSERVATION: "The requested water observation would move canonical time backward.",
  WATER_OBSERVATION_TIME_CONFLICT: "Another canonical water observation already owns this observation time.",
  WATER_STATE_CONCURRENCY_CONFLICT: "A concurrent canonical water update won this transition.",
  IRRIGATION_EVENT_STATE_MISMATCH: "The irrigation event belongs to a different workflow state.",
  IRRIGATION_EVENT_PAYLOAD_CONFLICT: "This irrigation event ID is already associated with different physical-event details.",
  INVALID_DAILY_ADVANCEMENT_REQUEST: "The one-day advancement request did not match the supported contract.",
  DAILY_ADVANCEMENT_BASELINE_REQUIRED: "Canonical water lineage is required before advancing one day.",
  DAILY_ADVANCEMENT_DISEASE_REQUIRED: "Current disease evidence is required before advancing one day.",
  DAILY_ADVANCEMENT_DATE_CONFLICT: "The requested date is not exactly one day after the canonical water date.",
  DAILY_ADVANCEMENT_PAYLOAD_CONFLICT: "This advancement ID is already associated with a different payload.",
  DAILY_ADVANCEMENT_TARGET_CONFLICT: "Another advancement identity already owns this required target date.",
  WATER_UPDATE_ID_MISMATCH: "FastAPI returned water state for a different update identity.",
  IRRIGATION_EVENT_ID_MISMATCH: "FastAPI returned a different reported irrigation identity.",
  ADVANCEMENT_ID_MISMATCH: "FastAPI returned a different advancement identity.",
  ADVANCEMENT_DATE_MISMATCH: "FastAPI returned a different advancement target date.",
};

export function ApiErrorPanel({ error, onRetry, title }: { error: unknown; onRetry?: () => void; title?: string }) {
  const apiError = error instanceof CropTwinApiError ? error : null;
  const kind = apiError?.kind === "timeout" ? "timeout" : apiError?.kind === "cancelled" ? "cancelled" : apiError?.kind === "malformed" ? "malformed" : "error";
  const description = apiError ? `${codeCopy[apiError.code] ?? "FastAPI could not complete this request."} ${apiError.message}` : "An unexpected client error prevented the request.";
  const details = apiError ? { status: apiError.statusCode, code: apiError.code, backend_message: apiError.message, details: apiError.details } : String(error);
  return <div className="grid gap-3"><AsyncStatePanel kind={kind} title={title} description={description} technicalDetails={details} />{onRetry ? <button type="button" onClick={onRetry} className="w-fit text-sm font-semibold text-[var(--agronomy-strong)] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Retry request</button> : null}</div>;
}
