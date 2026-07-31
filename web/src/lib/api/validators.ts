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
  WaterStateResponse,
  WeatherInput,
  WeatherSnapshotResponse,
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
const ETO_METHODS = ["penman_monteith", "hargreaves_samani"] as const;
const MOISTURE_STATES = ["adequate", "moderate_deficit", "depleted"] as const;
const STRESS_BANDS = ["low", "medium", "high"] as const;
const OBSERVATION_TIME_BASES = [
  "EXPLICIT",
  "DATE_ONLY_UTC_START",
  "SERVER_RECEIVED",
] as const;

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

export function parseWeatherSnapshotResponse(value: unknown): WeatherSnapshotResponse {
  if (
    isRecord(value) &&
    typeof value.state_id === "string" &&
    typeof value.target_date === "string" &&
    value.source === "open_meteo" &&
    typeof value.source_timezone === "string" &&
    isFiniteNumber(value.latitude) &&
    isFiniteNumber(value.longitude) &&
    isWeatherInput(value) &&
    isFiniteNumber(value.wind_source_height_m) &&
    value.wind_source_height_m > 0 &&
    isFiniteNumber(value.wind_normalized_height_m) &&
    value.wind_normalized_height_m > 0 &&
    isFiniteNumber(value.shortwave_radiation_sum_mj_m2) &&
    value.shortwave_radiation_sum_mj_m2 >= 0 &&
    isFiniteNumber(value.eto_reference_feed) &&
    value.eto_reference_feed >= 0 &&
    typeof value.fetched_at === "string"
  ) {
    return value as unknown as WeatherSnapshotResponse;
  }
  throw malformedResponseError("The CropTwin API returned an unexpected weather snapshot response.");
}

export function parseWaterStateResponse(value: unknown): WaterStateResponse {
  if (
    isRecord(value) &&
    typeof value.state_id === "string" &&
    optionalString(value.water_observation_id) &&
    nonNegativeInteger(value.water_sequence) &&
    optionalString(value.base_water_observation_id) &&
    nonNegativeInteger(value.base_water_sequence) &&
    nonNegativeNumber(value.previous_root_zone_depletion_mm) &&
    optionalString(value.water_update_id) &&
    optionalString(value.reported_irrigation_event_id) &&
    optionalString(value.applied_irrigation_event_id) &&
    nonNegativeNumber(value.effective_irrigation_mm) &&
    typeof value.irrigation_event_already_accounted_for === "boolean" &&
    isOneOf(value.crop_type, CROP_TYPES) &&
    typeof value.growth_stage === "string" &&
    isOneOf(value.soil_texture, SOIL_TEXTURES) &&
    isFiniteNumber(value.eto_computed) &&
    isOneOf(value.eto_method, ETO_METHODS) &&
    (value.eto_reference_feed === null || isFiniteNumber(value.eto_reference_feed)) &&
    (value.eto_delta_pct === null || isFiniteNumber(value.eto_delta_pct)) &&
    isFiniteNumber(value.kc) &&
    isFiniteNumber(value.etc) &&
    isFiniteNumber(value.field_capacity_assumed) &&
    isFiniteNumber(value.wilting_point_assumed) &&
    isFiniteNumber(value.root_depth_assumed) &&
    isFiniteNumber(value.taw) &&
    isFiniteNumber(value.p_allowable) &&
    isFiniteNumber(value.raw_threshold) &&
    isFiniteNumber(value.raw_root_zone_depletion_mm) &&
    isFiniteNumber(value.root_zone_depletion_mm) &&
    isFiniteNumber(value.root_zone_depletion) &&
    isFiniteNumber(value.water_surplus_mm) &&
    isFiniteNumber(value.depletion_beyond_taw_mm) &&
    isOneOf(value.estimated_moisture_state, MOISTURE_STATES) &&
    isOneOf(value.stress_band, STRESS_BANDS) &&
    typeof value.observed_at === "string" &&
    typeof value.computed_at === "string" &&
    isOneOf(value.observation_time_basis, OBSERVATION_TIME_BASES)
  ) {
    return value as unknown as WaterStateResponse;
  }
  throw malformedResponseError("The CropTwin API returned an unexpected water state response.");
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

function isWeatherInput(value: unknown): value is WeatherInput {
  return (
    isRecord(value) &&
    isFiniteNumber(value.tmin_c) &&
    isFiniteNumber(value.tmax_c) &&
    nonNegativeNumber(value.humidity_pct) &&
    value.humidity_pct <= 100 &&
    nonNegativeNumber(value.wind_speed_mps) &&
    nonNegativeNumber(value.rainfall_mm) &&
    (value.shortwave_radiation_sum_mj_m2 === undefined ||
      value.shortwave_radiation_sum_mj_m2 === null ||
      nonNegativeNumber(value.shortwave_radiation_sum_mj_m2)) &&
    (value.eto_reference_feed === undefined ||
      value.eto_reference_feed === null ||
      isFiniteNumber(value.eto_reference_feed))
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

function nonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function optionalString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
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
