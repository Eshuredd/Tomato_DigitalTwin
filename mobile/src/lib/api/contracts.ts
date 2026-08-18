import { z } from 'zod';
import type { components } from './schema';

export type Health = components['schemas']['HealthResponse'];
export const healthSchema = z.object({ status: z.string(), service: z.string(), version: z.string() }).strict();
export const systemInfoSchema = z.object({ disease_model: z.object({ model_version: z.string().trim().min(1) }).passthrough() }).passthrough();
export type SystemInfo = z.infer<typeof systemInfoSchema>;

export type Farm = components['schemas']['FarmResponse'];
export type CreateFarmInput = components['schemas']['FarmCreateRequest'];
export type Plot = components['schemas']['PlotResponse'];
export type CreatePlotInput = components['schemas']['PlotCreateRequest'];
export type CreateSessionInput = components['schemas']['CreateSessionRequest'];
export type CreateCropCycleInput = components['schemas']['CreateCropCycleRequest'];
export type CreatedSession = components['schemas']['SessionResponse'];
export type LoadedSession = components['schemas']['SessionStateResponse'];
export type SessionSummary = CreatedSession | LoadedSession;
export type PredictDiseaseInput = components['schemas']['PredictDiseaseRequest'];
export type DiseasePrediction = components['schemas']['DiseasePredictionResponse'];
export type WeatherSnapshot = components['schemas']['WeatherSnapshotResponse'];
export type WeatherInput = components['schemas']['WeatherInput'];
export type LastIrrigationEvent = components['schemas']['LastIrrigationEvent'];
export type ComputeWaterStateRequest = components['schemas']['ComputeWaterStateRequest'];
export type WaterStateResponse = components['schemas']['WaterStateResponse'];
export type TwinCurrentState = components['schemas']['TwinCurrentState'];
export type UpdateTwinStateResponse = components['schemas']['UpdateTwinStateResponse'];
export type AdvanceOneDayRequest = components['schemas']['AdvanceOneDayRequest'];
export type AdvanceOneDayResponse = components['schemas']['AdvanceOneDayResponse'];

export const soilTextures = ['sand', 'sandy_loam', 'loam', 'silty_loam', 'clay_loam', 'clay'] as const;
export const soilTextureSchema = z.enum(soilTextures);
const finite = z.number().finite();
export const locationSchema = z.object({
  name: z.string().min(1), latitude: finite.min(-90).max(90), longitude: finite.min(-180).max(180), elevation_m: finite.nullish(),
}).strict();
export const farmSchema = z.object({ farm_id: z.string().min(1), name: z.string().min(1), created_at: z.string(), updated_at: z.string() }).strict();
export const farmsSchema = z.array(farmSchema);
export const plotSchema = z.object({
  plot_id: z.string().min(1), farm_id: z.string().min(1), name: z.string().min(1), location: locationSchema,
  soil_texture: soilTextureSchema, created_at: z.string(), updated_at: z.string(),
}).strict();
export const plotsSchema = z.array(plotSchema);
export const createdSessionSchema = z.object({
  state_id: z.string().min(1), crop_type: z.literal('tomato'), planting_date: z.string(), location: locationSchema,
  soil_texture: soilTextureSchema, created_at: z.string(),
}).strict();
export const timezoneAwareTimestampSchema = z.string().refine((value) => /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value)), 'Timestamp must include a valid timezone offset.');
export const twinCurrentStateSchema = z.object({
  crop_type: z.literal('tomato'), growth_stage: z.enum(['initial', 'development', 'mid_season', 'late_season']),
  days_since_planting: z.number().int(), predicted_label: z.string(), disease_category: z.enum(['fungal', 'bacterial', 'viral', 'none']),
  confidence_calibrated: finite, uncertainty_score: finite, uncertainty_band: z.enum(['low', 'medium', 'high']),
  eto_computed: finite, eto_method: z.enum(['penman_monteith', 'hargreaves_samani']),
  kc: finite, etc: finite, taw: finite, raw_threshold: finite, raw_root_zone_depletion_mm: finite, root_zone_depletion_mm: finite,
  root_zone_depletion: finite, water_surplus_mm: finite, depletion_beyond_taw_mm: finite,
  estimated_moisture_state: z.enum(['adequate', 'moderate_deficit', 'depleted']), stress_band: z.enum(['low', 'medium', 'high']),
  observed_at: timezoneAwareTimestampSchema, computed_at: timezoneAwareTimestampSchema, observation_time_basis: z.enum(['EXPLICIT', 'DATE_ONLY_UTC_START', 'SERVER_RECEIVED']), last_update_time: timezoneAwareTimestampSchema,
}).strict();
export const loadedSessionSchema = z.object({
  state_id: z.string().min(1), crop_type: z.literal('tomato'), planting_date: z.string(), location: locationSchema,
  soil_texture: soilTextureSchema, current_state: twinCurrentStateSchema,
}).strict();
export const diseasePredictionSchema = z.object({
  state_id: z.string().min(1), crop_type: z.literal('tomato'), predicted_label: z.string(),
  disease_category: z.enum(['fungal', 'bacterial', 'viral', 'none']), class_probs: z.record(z.string(), finite.min(0).max(1)),
  confidence_calibrated: finite.min(0).max(1), uncertainty_score: finite, uncertainty_band: z.enum(['low', 'medium', 'high']), predicted_at: z.string(),
}).strict();
export const weatherSnapshotSchema = z.object({
  state_id: z.string().min(1), target_date: z.string(), source: z.literal('open_meteo'), source_timezone: z.string().min(1),
  latitude: finite, longitude: finite, tmin_c: finite, tmax_c: finite, humidity_pct: finite.min(0).max(100), wind_speed_mps: finite.min(0),
  wind_source_height_m: finite.positive(), wind_normalized_height_m: finite.positive(), rainfall_mm: finite.min(0),
  shortwave_radiation_sum_mj_m2: finite.min(0), eto_reference_feed: finite.min(0), fetched_at: z.string(),
}).strict();
export const weatherInputSchema = z.object({
  tmin_c: finite, tmax_c: finite, humidity_pct: finite.min(0).max(100), wind_speed_mps: finite.min(0),
  shortwave_radiation_sum_mj_m2: finite.min(0).nullable().optional(), rainfall_mm: finite.min(0), eto_reference_feed: finite.nullable().optional(),
}).strict();
const nullableNonEmpty = z.string().min(1).nullable().optional();
export const lastIrrigationEventSchema = z.object({
  irrigation_event_id: nullableNonEmpty, timestamp: timezoneAwareTimestampSchema, amount_mm: finite.min(0),
  source: z.enum(['MANUAL', 'CONVERTED_FROM_LITRES', 'CONVERTED_FROM_DRIP_RUNTIME', 'LEGACY_REQUEST']),
}).strict();
export const waterStateSchema = z.object({
  state_id: z.string().min(1), water_observation_id: nullableNonEmpty, water_sequence: z.number().int().min(0),
  base_water_observation_id: nullableNonEmpty, base_water_sequence: z.number().int().min(0), previous_root_zone_depletion_mm: finite.min(0),
  water_update_id: nullableNonEmpty, reported_irrigation_event_id: nullableNonEmpty, applied_irrigation_event_id: nullableNonEmpty,
  effective_irrigation_mm: finite.min(0), irrigation_event_already_accounted_for: z.boolean(), crop_type: z.literal('tomato'),
  growth_stage: z.enum(['initial', 'development', 'mid_season', 'late_season']), soil_texture: soilTextureSchema,
  eto_computed: finite, eto_method: z.enum(['penman_monteith', 'hargreaves_samani']), eto_reference_feed: finite.nullable(), eto_delta_pct: finite.nullable(),
  kc: finite, etc: finite, field_capacity_assumed: finite, wilting_point_assumed: finite, root_depth_assumed: finite,
  taw: finite, p_allowable: finite.min(0).max(1), raw_threshold: finite, raw_root_zone_depletion_mm: finite,
  root_zone_depletion_mm: finite, root_zone_depletion: finite, water_surplus_mm: finite, depletion_beyond_taw_mm: finite,
  estimated_moisture_state: z.enum(['adequate', 'moderate_deficit', 'depleted']), stress_band: z.enum(['low', 'medium', 'high']),
  observed_at: timezoneAwareTimestampSchema, computed_at: timezoneAwareTimestampSchema, observation_time_basis: z.enum(['EXPLICIT', 'DATE_ONLY_UTC_START', 'SERVER_RECEIVED']),
}).strict().superRefine((value, context) => {
  if ((value.water_sequence > 0) !== Boolean(value.water_observation_id)) context.addIssue({ code: 'custom', message: 'Water observation identity and sequence are inconsistent.' });
  if ((value.base_water_sequence > 0) !== Boolean(value.base_water_observation_id)) context.addIssue({ code: 'custom', message: 'Base water identity and sequence are inconsistent.' });
});
export const updateTwinStateSchema = z.object({
  state_id: z.string().min(1), current_state: twinCurrentStateSchema, state_history_count: z.number().int().min(0), snapshot_id: nullableNonEmpty, snapshot_created: z.boolean(),
}).strict();
export const advanceOneDaySchema = z.object({
  state_id: z.string().min(1), advancement_id: z.string().min(1).max(120), target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), advancement_created: z.boolean(),
  water_state: waterStateSchema, twin_state: updateTwinStateSchema,
}).strict();
