import { CropTwinApiError } from "./errors";
import type {
  AdvanceOneDayResponse,
  CropType,
  DiseaseCategory,
  DiseasePredictionResponse,
  GrowthStage,
  HealthResponse,
  Location,
  SessionResponse,
  SessionStateResponse,
  SoilTexture,
  SystemInfoResponse,
  TwinCurrentState,
  UncertaintyBand,
  UpdateTwinStateResponse,
  WaterStateResponse,
  WeatherInput,
  WeatherSnapshotResponse,
} from "@/lib/types/api";
import type { JsonObject } from "@/lib/types/common";

const CROP_TYPES = ["tomato"] as const satisfies readonly CropType[];
const GROWTH_STAGES = [
  "initial",
  "development",
  "mid_season",
  "late_season",
] as const satisfies readonly GrowthStage[];
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
    nonEmptyString(value.state_id) &&
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
    nonEmptyString(value.state_id) &&
    isOneOf(value.crop_type, CROP_TYPES) &&
    typeof value.planting_date === "string" &&
    isLocation(value.location) &&
    isOneOf(value.soil_texture, SOIL_TEXTURES)
  ) {
    return {
      ...(value as unknown as Omit<SessionStateResponse, "current_state">),
      current_state: parseTwinCurrentState(value.current_state),
    };
  }
  throw malformedResponseError("The CropTwin API returned an unexpected session-state response.");
}

export function parseDiseasePredictionResponse(value: unknown): DiseasePredictionResponse {
  if (
    isRecord(value) &&
    nonEmptyString(value.state_id) &&
    isOneOf(value.crop_type, CROP_TYPES) &&
    typeof value.predicted_label === "string" &&
    isOneOf(value.disease_category, DISEASE_CATEGORIES) &&
    isClassProbabilities(value.class_probs) &&
    isFiniteNumber(value.confidence_calibrated) &&
    isFiniteNumber(value.uncertainty_score) &&
    isOneOf(value.uncertainty_band, UNCERTAINTY_BANDS) &&
    isValidTimestamp(value.predicted_at)
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
    nonEmptyString(value.state_id) &&
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
    isValidTimestamp(value.fetched_at)
  ) {
    return value as unknown as WeatherSnapshotResponse;
  }
  throw malformedResponseError("The CropTwin API returned an unexpected weather snapshot response.");
}

export function parseWaterStateResponse(value: unknown): WaterStateResponse {
  if (
    isRecord(value) &&
    nonEmptyString(value.state_id) &&
    optionalNonEmptyString(value.water_observation_id) &&
    nonNegativeInteger(value.water_sequence) &&
    optionalNonEmptyString(value.base_water_observation_id) &&
    nonNegativeInteger(value.base_water_sequence) &&
    nonNegativeNumber(value.previous_root_zone_depletion_mm) &&
    optionalNonEmptyString(value.water_update_id) &&
    optionalNonEmptyString(value.reported_irrigation_event_id) &&
    optionalNonEmptyString(value.applied_irrigation_event_id) &&
    nonNegativeNumber(value.effective_irrigation_mm) &&
    typeof value.irrigation_event_already_accounted_for === "boolean" &&
    isOneOf(value.crop_type, CROP_TYPES) &&
    isOneOf(value.growth_stage, GROWTH_STAGES) &&
    isOneOf(value.soil_texture, SOIL_TEXTURES) &&
    nonNegativeNumber(value.eto_computed) &&
    isOneOf(value.eto_method, ETO_METHODS) &&
    (value.eto_reference_feed === null || nonNegativeNumber(value.eto_reference_feed)) &&
    (value.eto_delta_pct === null || isFiniteNumber(value.eto_delta_pct)) &&
    nonNegativeNumber(value.kc) &&
    nonNegativeNumber(value.etc) &&
    nonNegativeNumber(value.field_capacity_assumed) &&
    nonNegativeNumber(value.wilting_point_assumed) &&
    nonNegativeNumber(value.root_depth_assumed) &&
    nonNegativeNumber(value.taw) &&
    nonNegativeNumber(value.p_allowable) &&
    nonNegativeNumber(value.raw_threshold) &&
    nonNegativeNumber(value.raw_root_zone_depletion_mm) &&
    nonNegativeNumber(value.root_zone_depletion_mm) &&
    nonNegativeNumber(value.root_zone_depletion) &&
    nonNegativeNumber(value.water_surplus_mm) &&
    nonNegativeNumber(value.depletion_beyond_taw_mm) &&
    isOneOf(value.estimated_moisture_state, MOISTURE_STATES) &&
    isOneOf(value.stress_band, STRESS_BANDS) &&
    isValidTimestamp(value.observed_at) &&
    isValidTimestamp(value.computed_at) &&
    isOneOf(value.observation_time_basis, OBSERVATION_TIME_BASES)
  ) {
    return value as unknown as WaterStateResponse;
  }
  throw malformedResponseError("The CropTwin API returned an unexpected water state response.");
}

export function parseTwinCurrentState(value: unknown): TwinCurrentState {
  if (
    isRecord(value) &&
    isOneOf(value.crop_type, CROP_TYPES) &&
    isOneOf(value.growth_stage, GROWTH_STAGES) &&
    nonNegativeInteger(value.days_since_planting) &&
    typeof value.predicted_label === "string" &&
    isOneOf(value.disease_category, DISEASE_CATEGORIES) &&
    isFiniteNumber(value.confidence_calibrated) &&
    value.confidence_calibrated >= 0 &&
    value.confidence_calibrated <= 1 &&
    isFiniteNumber(value.uncertainty_score) &&
    isOneOf(value.uncertainty_band, UNCERTAINTY_BANDS) &&
    nonNegativeNumber(value.eto_computed) &&
    isOneOf(value.eto_method, ETO_METHODS) &&
    nonNegativeNumber(value.kc) &&
    nonNegativeNumber(value.etc) &&
    nonNegativeNumber(value.taw) &&
    nonNegativeNumber(value.raw_threshold) &&
    nonNegativeNumber(value.raw_root_zone_depletion_mm) &&
    nonNegativeNumber(value.root_zone_depletion_mm) &&
    nonNegativeNumber(value.root_zone_depletion) &&
    nonNegativeNumber(value.water_surplus_mm) &&
    nonNegativeNumber(value.depletion_beyond_taw_mm) &&
    isOneOf(value.estimated_moisture_state, MOISTURE_STATES) &&
    isOneOf(value.stress_band, STRESS_BANDS) &&
    isValidTimestamp(value.observed_at) &&
    isValidTimestamp(value.computed_at) &&
    isOneOf(value.observation_time_basis, OBSERVATION_TIME_BASES) &&
    isValidTimestamp(value.last_update_time)
  ) {
    return value as unknown as TwinCurrentState;
  }
  throw malformedResponseError("The CropTwin API returned an unexpected twin current-state response.");
}

export function parseUpdateTwinStateResponse(value: unknown): UpdateTwinStateResponse {
  if (
    isRecord(value) &&
    nonEmptyString(value.state_id) &&
    nonNegativeInteger(value.state_history_count) &&
    optionalNonEmptyString(value.snapshot_id) &&
    typeof value.snapshot_created === "boolean"
  ) {
    return {
      ...(value as unknown as Omit<UpdateTwinStateResponse, "current_state">),
      current_state: parseTwinCurrentState(value.current_state),
    };
  }
  throw malformedResponseError("The CropTwin API returned an unexpected twin-state update response.");
}

export function parseAdvanceOneDayResponse(value: unknown): AdvanceOneDayResponse {
  if (
    isRecord(value) &&
    nonEmptyString(value.state_id) &&
    nonEmptyString(value.advancement_id) &&
    isDateOnly(value.target_date) &&
    typeof value.advancement_created === "boolean"
  ) {
    const water_state = parseWaterStateResponse(value.water_state);
    const twin_state = parseUpdateTwinStateResponse(value.twin_state);
    if (water_state.state_id !== value.state_id || twin_state.state_id !== value.state_id) {
      throw malformedResponseError(
        "The CropTwin API returned an advancement response with mismatched nested state IDs.",
      );
    }
    return {
      ...(value as unknown as Omit<AdvanceOneDayResponse, "water_state" | "twin_state">),
      water_state,
      twin_state,
    };
  }
  throw malformedResponseError("The CropTwin API returned an unexpected one-day advancement response.");
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

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalNonEmptyString(value: unknown): boolean {
  return value === undefined || value === null || nonEmptyString(value);
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

function isDateOnly(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return false;
  }
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

function isValidTimestamp(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
  );
  if (!match) {
    return false;
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
    return false;
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    return false;
  }
  if (zone !== "Z") {
    const zoneHour = Number(zone.slice(1, 3));
    const zoneMinute = Number(zone.slice(4, 6));
    if (zoneHour > 23 || zoneMinute > 59) {
      return false;
    }
  }
  return !Number.isNaN(Date.parse(value));
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
