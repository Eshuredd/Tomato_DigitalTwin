export type ApiErrorKind = 'backend' | 'http' | 'network' | 'timeout' | 'cancelled' | 'malformed';

export class CropTwinApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly code: string;
  readonly statusCode?: number;
  readonly details: Record<string, unknown>;

  constructor({ kind, code, message, statusCode, details = {}, cause }: { kind: ApiErrorKind; code: string; message: string; statusCode?: number; details?: Record<string, unknown>; cause?: unknown }) {
    super(message, { cause });
    this.name = 'CropTwinApiError'; this.kind = kind; this.code = code; this.statusCode = statusCode; this.details = details;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

export function parseBackendError(payload: unknown, fallbackStatus: number): CropTwinApiError | null {
  if (!isRecord(payload) || !isRecord(payload.error)) return null;
  const error = payload.error;
  if (typeof error.code !== 'string' || typeof error.message !== 'string') return null;
  return new CropTwinApiError({
    kind: 'backend', code: error.code, message: error.message,
    statusCode: typeof error.status_code === 'number' ? error.status_code : fallbackStatus,
    details: isRecord(error.details) ? error.details : {},
  });
}

const friendlyByKind: Record<ApiErrorKind, string> = {
  backend: 'CropTwin could not complete this request.', http: 'The CropTwin service returned an unexpected response.',
  network: 'The configured CropTwin service could not be reached.', timeout: 'The service did not respond in time.',
  cancelled: 'The request was cancelled.', malformed: 'CropTwin received data it could not safely understand.',
};

export function toUserFacingError(error: unknown): { title: string; description: string; technicalDetails: unknown } {
  if (error instanceof CropTwinApiError) return { title: error.kind === 'network' ? 'Service unavailable' : 'Connection check failed', description: friendlyByKind[error.kind], technicalDetails: { kind: error.kind, status: error.statusCode, code: error.code, message: error.message, details: error.details } };
  return { title: 'Unexpected error', description: 'The app could not complete this request.', technicalDetails: String(error) };
}
