import { AsyncStatePanel } from "./async-state-panel";
import { CropTwinApiError } from "@/lib/api/errors";

const codeCopy: Record<string, string> = {
  FASTAPI_VALIDATION_ERROR: "Some submitted values were rejected by FastAPI.",
  STATE_NOT_FOUND: "The requested farm, plot, or session was not found.",
  FARM_NOT_FOUND: "The requested farm was not found.",
  PLOT_NOT_FOUND: "The requested plot was not found.",
  MISSING_CACHED_OUTPUT: "The session exists, but its current twin state has not been computed yet.",
};

export function ApiErrorPanel({ error, onRetry, title }: { error: unknown; onRetry?: () => void; title?: string }) {
  const apiError = error instanceof CropTwinApiError ? error : null;
  const kind = apiError?.kind === "timeout" ? "timeout" : apiError?.kind === "cancelled" ? "cancelled" : apiError?.kind === "malformed" ? "malformed" : "error";
  const description = apiError ? `${codeCopy[apiError.code] ?? "FastAPI could not complete this request."} ${apiError.message}` : "An unexpected client error prevented the request.";
  const details = apiError ? { status: apiError.statusCode, code: apiError.code, backend_message: apiError.message, details: apiError.details } : String(error);
  return <div className="grid gap-3"><AsyncStatePanel kind={kind} title={title} description={description} technicalDetails={details} />{onRetry ? <button type="button" onClick={onRetry} className="w-fit text-sm font-semibold text-[var(--agronomy-strong)] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Retry request</button> : null}</div>;
}
