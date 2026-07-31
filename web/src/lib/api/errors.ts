import type { CropTwinErrorEnvelope } from "@/lib/types/api";
import type { JsonObject, JsonValue } from "@/lib/types/common";

export type CropTwinErrorKind =
  | "api"
  | "network"
  | "timeout"
  | "abort"
  | "non_json"
  | "malformed"
  | "empty";

export class CropTwinApiError extends Error {
  readonly kind: CropTwinErrorKind;
  readonly status: number | null;
  readonly code: string;
  readonly details: JsonObject;
  readonly response?: Response;

  constructor({
    kind,
    status,
    code,
    message,
    details = {},
    response,
  }: {
    kind: CropTwinErrorKind;
    status: number | null;
    code: string;
    message: string;
    details?: JsonObject;
    response?: Response;
  }) {
    super(message);
    this.name = "CropTwinApiError";
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.details = redactSensitive(details) as JsonObject;
    this.response = response;
  }

  displayMessage(): string {
    if (this.kind === "network") {
      return "Could not connect to the CropTwin API.";
    }
    if (this.kind === "timeout") {
      return "The CropTwin API request timed out.";
    }
    if (this.kind === "abort") {
      return "The CropTwin API request was cancelled.";
    }
    return this.message;
  }
}

export function isCropTwinErrorEnvelope(value: unknown): value is CropTwinErrorEnvelope {
  if (!isRecord(value)) {
    return false;
  }
  const error = value.error;
  return (
    isRecord(error) &&
    typeof error.code === "string" &&
    typeof error.message === "string" &&
    (error.details === undefined || isRecord(error.details))
  );
}

export function errorFromStructuredEnvelope(
  envelope: CropTwinErrorEnvelope,
  response: Response,
): CropTwinApiError {
  return new CropTwinApiError({
    kind: "api",
    status: response.status,
    code: envelope.error.code,
    message: envelope.error.message,
    details: envelope.error.details,
    response,
  });
}

export function redactSensitive(value: JsonValue | unknown): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item));
  }
  if (isRecord(value)) {
    const redacted: JsonObject = {};
    for (const [key, item] of Object.entries(value)) {
      redacted[key] =
        key === "image_base64" ? "[redacted]" : redactSensitive(item);
    }
    return redacted;
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
