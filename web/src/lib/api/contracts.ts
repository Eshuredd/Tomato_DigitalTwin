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

export const soilTextures = ["sand", "sandy_loam", "loam", "silty_loam", "clay_loam", "clay"] as const;
export const soilTextureSchema = z.enum(soilTextures);
export type SoilTexture = z.infer<typeof soilTextureSchema>;

const finiteNumber = z.number().finite();
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

const twinCurrentStateSchema = z.object({
  crop_type: z.literal("tomato"), growth_stage: z.enum(["initial", "development", "mid_season", "late_season"]),
  days_since_planting: z.number().int(), predicted_label: z.string(), disease_category: z.enum(["fungal", "bacterial", "viral", "none"]),
  confidence_calibrated: z.number(), uncertainty_score: z.number(), uncertainty_band: z.enum(["low", "medium", "high"]),
  eto_computed: z.number(), eto_method: z.enum(["penman_monteith", "hargreaves_samani"]), kc: z.number(), etc: z.number(),
  taw: z.number(), raw_threshold: z.number(), raw_root_zone_depletion_mm: z.number(), root_zone_depletion_mm: z.number(),
  root_zone_depletion: z.number(), water_surplus_mm: z.number(), depletion_beyond_taw_mm: z.number(),
  estimated_moisture_state: z.enum(["adequate", "moderate_deficit", "depleted"]), stress_band: z.enum(["low", "medium", "high"]),
  observed_at: z.string(), computed_at: z.string(), observation_time_basis: z.enum(["EXPLICIT", "DATE_ONLY_UTC_START", "SERVER_RECEIVED"]), last_update_time: z.string(),
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
