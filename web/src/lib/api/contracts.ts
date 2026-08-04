import { z } from "zod";
import type { components } from "./schema";
import {
  optionalFiniteNumber,
  requiredFiniteNumber,
} from "@/lib/forms/number-fields";

export type Health = components["schemas"]["HealthResponse"];
export type Farm = components["schemas"]["FarmResponse"];
export type CreateFarmInput = components["schemas"]["FarmCreateRequest"];
export type Plot = components["schemas"]["PlotResponse"];
export type CreatePlotInput = components["schemas"]["PlotCreateRequest"];
export type CreateCropCycleInput = components["schemas"]["CreateCropCycleRequest"];
export type CreateSessionInput = components["schemas"]["CreateSessionRequest"];
export type CreatedSession = components["schemas"]["SessionResponse"];
export type LoadedSession = components["schemas"]["SessionStateResponse"];
export type SessionSummary = CreatedSession | LoadedSession;
export type PredictDiseaseInput = components["schemas"]["PredictDiseaseRequest"];
export type DiseasePrediction = components["schemas"]["DiseasePredictionResponse"];
export type WeatherInput = components["schemas"]["WeatherInput"];
export type WeatherSnapshot = components["schemas"]["WeatherSnapshotResponse"];
export type LastIrrigationEvent = components["schemas"]["LastIrrigationEvent"];
export type ComputeWaterStateRequest = components["schemas"]["ComputeWaterStateRequest"];
export type WaterStateResponse = components["schemas"]["WaterStateResponse"];
export type TwinCurrentState = components["schemas"]["TwinCurrentState"];
export type UpdateTwinStateResponse = components["schemas"]["UpdateTwinStateResponse"];
export type AdvanceOneDayRequest = components["schemas"]["AdvanceOneDayRequest"];
export type AdvanceOneDayResponse = components["schemas"]["AdvanceOneDayResponse"];

export const soilTextures = ["sand", "sandy_loam", "loam", "silty_loam", "clay_loam", "clay"] as const;
export const soilTextureSchema = z.enum(soilTextures);
export type SoilTexture = z.infer<typeof soilTextureSchema>;

const finiteNumber = z.number().finite();
export const timezoneAwareTimestampSchema = z.string().refine((value) => {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}, "Timestamp must include a valid timezone offset.");
export const locationSchema = z.object({
  name: z.string().min(1),
  latitude: finiteNumber.min(-90).max(90),
  longitude: finiteNumber.min(-180).max(180),
  elevation_m: finiteNumber.nullish(),
}).strict();

export const healthSchema = z.object({ status: z.string(), service: z.string(), version: z.string() }).strict();
export const farmSchema = z.object({
  farm_id: z.string().min(1), name: z.string(), created_at: z.string(), updated_at: z.string(),
}).strict();
export const farmsSchema = z.array(farmSchema);
export const plotSchema = z.object({
  plot_id: z.string().min(1), farm_id: z.string().min(1), name: z.string(), location: locationSchema,
  soil_texture: soilTextureSchema, created_at: z.string(), updated_at: z.string(),
}).strict();
export const plotsSchema = z.array(plotSchema);

export const twinCurrentStateSchema = z.object({
  crop_type: z.literal("tomato"), growth_stage: z.enum(["initial", "development", "mid_season", "late_season"]),
  days_since_planting: z.number().int(), predicted_label: z.string(), disease_category: z.enum(["fungal", "bacterial", "viral", "none"]),
  confidence_calibrated: finiteNumber.min(0).max(1), uncertainty_score: finiteNumber, uncertainty_band: z.enum(["low", "medium", "high"]),
  eto_computed: finiteNumber, eto_method: z.enum(["penman_monteith", "hargreaves_samani"]), kc: finiteNumber, etc: finiteNumber,
  taw: finiteNumber, raw_threshold: finiteNumber, raw_root_zone_depletion_mm: finiteNumber, root_zone_depletion_mm: finiteNumber,
  root_zone_depletion: finiteNumber, water_surplus_mm: finiteNumber, depletion_beyond_taw_mm: finiteNumber,
  estimated_moisture_state: z.enum(["adequate", "moderate_deficit", "depleted"]), stress_band: z.enum(["low", "medium", "high"]),
  observed_at: timezoneAwareTimestampSchema, computed_at: timezoneAwareTimestampSchema, observation_time_basis: z.enum(["EXPLICIT", "DATE_ONLY_UTC_START", "SERVER_RECEIVED"]), last_update_time: timezoneAwareTimestampSchema,
}).strict();

export const createdSessionSchema = z.object({
  state_id: z.string().min(1), crop_type: z.literal("tomato"), planting_date: z.string(), location: locationSchema,
  soil_texture: soilTextureSchema, created_at: z.string(),
}).strict();
export const loadedSessionSchema = z.object({
  state_id: z.string().min(1), crop_type: z.literal("tomato"), planting_date: z.string(), location: locationSchema,
  soil_texture: soilTextureSchema, current_state: twinCurrentStateSchema,
}).strict();

const stringRecord = z.record(z.string(), z.unknown());
export const systemInfoSchema = z.object({
  project_name: z.string(), api_stage: z.string(), decision_boundary: z.string(), crop_type: z.literal("tomato"),
  disease_model: stringRecord, growth_stage_config: stringRecord, water_model_config: stringRecord,
  recommendation_policy: stringRecord, narrator_policy: stringRecord,
}).strict();
export type SystemInfo = z.infer<typeof systemInfoSchema>;

export const diseasePredictionSchema = z.object({
  state_id: z.string().min(1),
  crop_type: z.literal("tomato"),
  predicted_label: z.string().min(1),
  disease_category: z.enum(["fungal", "bacterial", "viral", "none"]),
  class_probs: z.record(z.string(), z.number().finite().min(0).max(1)),
  confidence_calibrated: z.number().finite().min(0).max(1),
  uncertainty_score: z.number().finite(),
  uncertainty_band: z.enum(["low", "medium", "high"]),
  predicted_at: timezoneAwareTimestampSchema,
}).strict();

export const weatherInputSchema = z.object({
  tmin_c: z.number().finite(),
  tmax_c: z.number().finite(),
  humidity_pct: z.number().finite().min(0).max(100),
  wind_speed_mps: z.number().finite().min(0),
  shortwave_radiation_sum_mj_m2: z.number().finite().min(0).nullable().optional(),
  rainfall_mm: z.number().finite().min(0),
  eto_reference_feed: z.number().finite().nullable().optional(),
}).strict();

export const weatherSnapshotSchema = z.object({
  state_id: z.string().min(1),
  target_date: z.string(),
  source: z.literal("open_meteo"),
  source_timezone: z.string().min(1),
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  tmin_c: z.number().finite(),
  tmax_c: z.number().finite(),
  humidity_pct: z.number().finite().min(0).max(100),
  wind_speed_mps: z.number().finite().min(0),
  wind_source_height_m: z.number().finite().positive(),
  wind_normalized_height_m: z.number().finite().positive(),
  rainfall_mm: z.number().finite().min(0),
  shortwave_radiation_sum_mj_m2: z.number().finite().min(0),
  eto_reference_feed: z.number().finite().min(0),
  fetched_at: timezoneAwareTimestampSchema,
}).strict();

const nullableNonEmpty = z.string().min(1).nullable().optional();
export const lastIrrigationEventSchema = z.object({
  irrigation_event_id: nullableNonEmpty,
  timestamp: timezoneAwareTimestampSchema,
  amount_mm: finiteNumber.min(0),
  source: z.enum(["MANUAL", "CONVERTED_FROM_LITRES", "CONVERTED_FROM_DRIP_RUNTIME", "LEGACY_REQUEST"]),
}).strict();

export const waterStateSchema = z.object({
  state_id: z.string().min(1), water_observation_id: nullableNonEmpty, water_sequence: z.number().int().min(0),
  base_water_observation_id: nullableNonEmpty, base_water_sequence: z.number().int().min(0), previous_root_zone_depletion_mm: finiteNumber.min(0),
  water_update_id: nullableNonEmpty, reported_irrigation_event_id: nullableNonEmpty, applied_irrigation_event_id: nullableNonEmpty,
  effective_irrigation_mm: finiteNumber.min(0), irrigation_event_already_accounted_for: z.boolean(), crop_type: z.literal("tomato"),
  growth_stage: z.enum(["initial", "development", "mid_season", "late_season"]), soil_texture: soilTextureSchema,
  eto_computed: finiteNumber, eto_method: z.enum(["penman_monteith", "hargreaves_samani"]), eto_reference_feed: finiteNumber.nullable(), eto_delta_pct: finiteNumber.nullable(),
  kc: finiteNumber, etc: finiteNumber, field_capacity_assumed: finiteNumber.min(0), wilting_point_assumed: finiteNumber.min(0), root_depth_assumed: finiteNumber.min(0),
  taw: finiteNumber.min(0), p_allowable: finiteNumber.min(0).max(1), raw_threshold: finiteNumber.min(0), raw_root_zone_depletion_mm: finiteNumber,
  root_zone_depletion_mm: finiteNumber.min(0), root_zone_depletion: finiteNumber.min(0), water_surplus_mm: finiteNumber.min(0), depletion_beyond_taw_mm: finiteNumber.min(0),
  estimated_moisture_state: z.enum(["adequate", "moderate_deficit", "depleted"]), stress_band: z.enum(["low", "medium", "high"]),
  observed_at: timezoneAwareTimestampSchema, computed_at: timezoneAwareTimestampSchema, observation_time_basis: z.enum(["EXPLICIT", "DATE_ONLY_UTC_START", "SERVER_RECEIVED"]),
}).strict().superRefine((value, context) => {
  if ((value.water_sequence > 0) !== Boolean(value.water_observation_id)) context.addIssue({ code: "custom", message: "Water observation ID and positive sequence must be paired." });
  if ((value.base_water_sequence > 0) !== Boolean(value.base_water_observation_id)) context.addIssue({ code: "custom", message: "Base water observation ID and positive sequence must be paired." });
});

export const updateTwinStateSchema = z.object({
  state_id: z.string().min(1), current_state: twinCurrentStateSchema, state_history_count: z.number().int().min(0), snapshot_id: nullableNonEmpty, snapshot_created: z.boolean(),
}).strict();

export const advanceOneDaySchema = z.object({
  state_id: z.string().min(1), advancement_id: z.string().min(1), target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), advancement_created: z.boolean(),
  water_state: waterStateSchema, twin_state: updateTwinStateSchema,
}).strict();

export const farmFormSchema = z.object({ name: z.string().trim().min(1, "Farm name is required.").max(200) });
export const locationFormSchema = z.object({
  name: z.string().trim().min(1, "Location name is required."),
  latitude: requiredFiniteNumber("Latitude").pipe(
    z.number().min(-90, "Latitude must be at least -90.").max(90, "Latitude must be at most 90."),
  ),
  longitude: requiredFiniteNumber("Longitude").pipe(
    z.number().min(-180, "Longitude must be at least -180.").max(180, "Longitude must be at most 180."),
  ),
  elevation_m: optionalFiniteNumber("Elevation").pipe(
    z.number().min(-500, "Elevation must be at least -500 m.").optional(),
  ),
});
export const plotFormSchema = z.object({ name: z.string().trim().min(1).max(200), location: locationFormSchema, soil_texture: soilTextureSchema });
export const sessionFormSchema = z.object({ planting_date: z.string().min(1), location: locationFormSchema, soil_texture: soilTextureSchema });
export const cropCycleFormSchema = z.object({ planting_date: z.string().min(1) });

export function locationPayload(value: z.infer<typeof locationFormSchema>) {
  return {
    name: value.name,
    latitude: value.latitude,
    longitude: value.longitude,
    ...(value.elevation_m === undefined ? {} : { elevation_m: value.elevation_m }),
  };
}
