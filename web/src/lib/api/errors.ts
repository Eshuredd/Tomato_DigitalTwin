export type ApiErrorKind = "backend" | "http" | "network" | "timeout" | "cancelled" | "malformed";

export interface BackendErrorDetail {
  status_code?: number | null;
  code: string;
  message: string;
  details: Record<string, unknown>;
}

export class CropTwinApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly code: string;
  readonly statusCode?: number;
  readonly details: Record<string, unknown>;

  constructor({ kind, code, message, statusCode, details = {}, cause }: { kind: ApiErrorKind; code: string; message: string; statusCode?: number; details?: Record<string, unknown>; cause?: unknown }) {
    super(message, { cause });
    this.name = "CropTwinApiError";
    this.kind = kind;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseBackendError(payload: unknown, fallbackStatus: number): CropTwinApiError | null {
  if (!isRecord(payload) || !isRecord(payload.error)) return null;
  const error = payload.error;
  if (typeof error.code !== "string" || typeof error.message !== "string") return null;
  return new CropTwinApiError({
    kind: "backend",
    code: error.code,
    message: error.message,
    statusCode: typeof error.status_code === "number" ? error.status_code : fallbackStatus,
    details: isRecord(error.details) ? error.details : {},
  });
}
