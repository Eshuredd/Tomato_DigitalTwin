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
const currentStateSchema = z.object({
  crop_type: z.literal('tomato'), growth_stage: z.enum(['initial', 'development', 'mid_season', 'late_season']),
  days_since_planting: z.number().int(), predicted_label: z.string(), disease_category: z.enum(['fungal', 'bacterial', 'viral', 'none']),
  confidence_calibrated: finite, uncertainty_score: finite, uncertainty_band: z.enum(['low', 'medium', 'high']),
  eto_computed: finite, eto_method: z.enum(['penman_monteith', 'hargreaves_samani']),
  kc: finite, etc: finite, taw: finite, raw_threshold: finite, raw_root_zone_depletion_mm: finite, root_zone_depletion_mm: finite,
  root_zone_depletion: finite, water_surplus_mm: finite, depletion_beyond_taw_mm: finite,
  estimated_moisture_state: z.enum(['adequate', 'moderate_deficit', 'depleted']), stress_band: z.enum(['low', 'medium', 'high']),
  observed_at: z.string(), computed_at: z.string(), observation_time_basis: z.enum(['EXPLICIT', 'DATE_ONLY_UTC_START', 'SERVER_RECEIVED']), last_update_time: z.string(),
}).strict();
export const loadedSessionSchema = z.object({
  state_id: z.string().min(1), crop_type: z.literal('tomato'), planting_date: z.string(), location: locationSchema,
  soil_texture: soilTextureSchema, current_state: currentStateSchema,
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
