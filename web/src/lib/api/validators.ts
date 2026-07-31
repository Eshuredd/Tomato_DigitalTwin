import { CropTwinApiError } from "./errors";
import type {
  CropType,
  DiseaseCategory,
  DiseasePredictionResponse,
  HealthResponse,
  Location,
  SessionResponse,
  SessionStateResponse,
  SoilTexture,
  SystemInfoResponse,
  TwinCurrentState,
  UncertaintyBand,
} from "@/lib/types/api";
import type { JsonObject } from "@/lib/types/common";

const CROP_TYPES = ["tomato"] as const satisfies readonly CropType[];
const SOIL_TEXTURES = [
  "sand",
  "sandy_loam",
  "loam",
  "silty_loam",
  "clay_loam",
  "clay",
] as const satisfies readonly SoilTexture[];
const DISEASE_CATEGORIES = ["fungal", "bacterial", "viral", "none"] as const satisfies readonly DiseaseCategory[];
const UNCERTAINTY_BANDS = ["low", "medium", "high"] as const satisfies readonly UncertaintyBand[];

export function parseHealthResponse(value: unknown): HealthResponse {
  if (
    isRecord(value) &&
    typeof value.status === "string" &&
    typeof value.service === "string" &&
    typeof value.version === "string"
  ) {
    return value as unknown as HealthResponse;
  }
  throw malformedResponseError(
    "The backend responded, but its health response did not match the expected format.",
  );
}

export function parseSessionResponse(value: unknown): SessionResponse {
  if (
    isRecord(value) &&
    typeof value.state_id === "string" &&
    isOneOf(value.crop_type, CROP_TYPES) &&
    typeof value.planting_date === "string" &&
    isLocation(value.location) &&
    isOneOf(value.soil_texture, SOIL_TEXTURES) &&
    typeof value.created_at === "string"
  ) {
    return value as unknown as SessionResponse;
  }
  throw malformedResponseError("The CropTwin API returned an unexpected session response.");
}

export function parseSessionStateResponse(value: unknown): SessionStateResponse {
  if (
    isRecord(value) &&
    typeof value.state_id === "string" &&
    isOneOf(value.crop_type, CROP_TYPES) &&
    typeof value.planting_date === "string" &&
    isLocation(value.location) &&
    isOneOf(value.soil_texture, SOIL_TEXTURES) &&
    isTwinCurrentState(value.current_state)
  ) {
    return value as unknown as SessionStateResponse;
  }
  throw malformedResponseError("The CropTwin API returned an unexpected session-state response.");
}

export function parseDiseasePredictionResponse(value: unknown): DiseasePredictionResponse {
  if (
    isRecord(value) &&
    typeof value.state_id === "string" &&
    isOneOf(value.crop_type, CROP_TYPES) &&
    typeof value.predicted_label === "string" &&
    isOneOf(value.disease_category, DISEASE_CATEGORIES) &&
    isClassProbabilities(value.class_probs) &&
    isFiniteNumber(value.confidence_calibrated) &&
    isFiniteNumber(value.uncertainty_score) &&
    isOneOf(value.uncertainty_band, UNCERTAINTY_BANDS) &&
    typeof value.predicted_at === "string"
  ) {
    return value as unknown as DiseasePredictionResponse;
  }
  throw malformedResponseError("The CropTwin API returned an unexpected disease response.");
}

export function parseSystemInfoResponse(value: unknown): SystemInfoResponse {
  if (
    isRecord(value) &&
    isOneOf(value.crop_type, CROP_TYPES) &&
    isRecord(value.disease_model) &&
    typeof value.disease_model.model_name === "string" &&
    typeof value.disease_model.model_version === "string"
  ) {
    return value as unknown as SystemInfoResponse;
  }
  throw malformedResponseError("The CropTwin API returned an unexpected system-info response.");
}

export function malformedResponseError(message: string): CropTwinApiError {
  return new CropTwinApiError({
    kind: "malformed",
    status: null,
    code: "FRONTEND_MALFORMED_RESPONSE",
    message,
  });
}

function isLocation(value: unknown): value is Location {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    isFiniteNumber(value.latitude) &&
    isFiniteNumber(value.longitude) &&
    (value.elevation_m === undefined ||
      value.elevation_m === null ||
      isFiniteNumber(value.elevation_m))
  );
}

function isTwinCurrentState(value: unknown): value is TwinCurrentState {
  return (
    isRecord(value) &&
    typeof value.growth_stage === "string" &&
    typeof value.predicted_label === "string" &&
    isOneOf(value.disease_category, DISEASE_CATEGORIES) &&
    isFiniteNumber(value.confidence_calibrated) &&
    isFiniteNumber(value.uncertainty_score) &&
    isOneOf(value.uncertainty_band, UNCERTAINTY_BANDS)
  );
}

function isClassProbabilities(value: unknown): value is Record<string, number> {
  if (!isRecord(value)) {
    return false;
  }
  return Object.values(value).every(isFiniteNumber);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOneOf<T extends string>(
  value: unknown,
  options: readonly T[],
): value is T {
  return typeof value === "string" && (options as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
