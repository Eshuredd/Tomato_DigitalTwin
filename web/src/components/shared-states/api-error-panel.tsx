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
};

export function ApiErrorPanel({ error, onRetry, title }: { error: unknown; onRetry?: () => void; title?: string }) {
  const apiError = error instanceof CropTwinApiError ? error : null;
  const kind = apiError?.kind === "timeout" ? "timeout" : apiError?.kind === "cancelled" ? "cancelled" : apiError?.kind === "malformed" ? "malformed" : "error";
  const description = apiError ? `${codeCopy[apiError.code] ?? "FastAPI could not complete this request."} ${apiError.message}` : "An unexpected client error prevented the request.";
  const details = apiError ? { status: apiError.statusCode, code: apiError.code, backend_message: apiError.message, details: apiError.details } : String(error);
  return <div className="grid gap-3"><AsyncStatePanel kind={kind} title={title} description={description} technicalDetails={details} />{onRetry ? <button type="button" onClick={onRetry} className="w-fit text-sm font-semibold text-[var(--agronomy-strong)] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Retry request</button> : null}</div>;
}
