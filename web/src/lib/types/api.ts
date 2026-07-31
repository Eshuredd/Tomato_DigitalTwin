import type { JsonObject } from "./common";

export type CropType = "tomato";
export type GrowthStage = "initial" | "development" | "mid_season" | "late_season";
export type SoilTexture =
  | "sand"
  | "sandy_loam"
  | "loam"
  | "silty_loam"
  | "clay_loam"
  | "clay";
export type ObservationTimeBasis =
  | "EXPLICIT"
  | "DATE_ONLY_UTC_START"
  | "SERVER_RECEIVED";
export type IrrigationEventSource =
  | "MANUAL"
  | "CONVERTED_FROM_LITRES"
  | "CONVERTED_FROM_DRIP_RUNTIME"
  | "CONTROLLER"
  | "SENSOR"
  | "LEGACY_REQUEST";
export type ActionEnum =
  | "IRRIGATE_NOW"
  | "IRRIGATE_IN_6H"
  | "IRRIGATE_TOMORROW_AM"
  | "NO_IRRIGATION_24H";
export type IrrigationConstraint =
  | "NONE"
  | "AVOID_OVERHEAD_IRRIGATION"
  | "PREFER_EARLY_MORNING_WINDOW";
export type UncertaintyBand = "low" | "medium" | "high";
export type StressBand = "low" | "medium" | "high";
export type MoistureState = "adequate" | "moderate_deficit" | "depleted";
export type EtoMethod = "penman_monteith" | "hargreaves_samani";
export type DiseaseCategory = "fungal" | "bacterial" | "viral" | "none";
export type CautionReason = "HIGH_UNCERTAINTY" | "FUNGAL_DISEASE_RISK";

export interface CropTwinErrorEnvelope {
  error: {
    status_code?: number | null;
    code: string;
    message: string;
    details: JsonObject;
  };
}

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
}

export interface DiseaseClassInfo {
  label: string;
  category: DiseaseCategory;
}

export interface SystemInfoResponse {
  project_name?: string;
  api_stage?: string;
  decision_boundary?: string;
  crop_type: CropType;
  disease_model: {
    model_name: string;
    model_version: string;
    dataset: string;
    calibration_method: string;
    uncertainty_method: string;
    classes: DiseaseClassInfo[];
    ece_validation_score?: number | null;
    [key: string]: unknown;
  };
  growth_stage_config: {
    source: string;
    stages_days: Record<string, number>;
  };
  water_model_config: {
    primary_eto_method: EtoMethod;
    fallback_eto_method: EtoMethod;
    fallback_trigger: string;
    reference_feed: string;
    soil_parameter_basis: string;
    root_depth_basis: string;
    kc_config_source: string;
    kc_by_stage: Record<string, number>;
    [key: string]: unknown;
  };
  recommendation_policy?: Record<string, unknown>;
  narrator_policy: {
    caution_triggers: CautionReason[];
    [key: string]: unknown;
  };
}

export interface Location {
  name: string;
  latitude: number;
  longitude: number;
  elevation_m?: number | null;
}

export interface CreateSessionRequest {
  crop_type: CropType;
  planting_date: string;
  location: Location;
  soil_texture: SoilTexture;
}

export interface SessionResponse {
  state_id: string;
  crop_type: CropType;
  planting_date: string;
  location: Location;
  soil_texture: SoilTexture;
  created_at: string;
}

export interface HistoryEvent {
  timestamp: string;
  growth_stage: GrowthStage;
  predicted_label: string;
  root_zone_depletion: number;
  stress_band: StressBand;
}

export interface TwinCurrentState {
  crop_type: CropType;
  growth_stage: GrowthStage;
  days_since_planting: number;
  predicted_label: string;
  disease_category: DiseaseCategory;
  confidence_calibrated: number;
  uncertainty_score: number;
  uncertainty_band: UncertaintyBand;
  eto_computed: number;
  eto_method: EtoMethod;
  kc: number;
  etc: number;
  taw: number;
  raw_threshold: number;
  raw_root_zone_depletion_mm: number;
  root_zone_depletion_mm: number;
  root_zone_depletion: number;
  water_surplus_mm: number;
  depletion_beyond_taw_mm: number;
  estimated_moisture_state: MoistureState;
  stress_band: StressBand;
  observed_at: string;
  computed_at: string;
  observation_time_basis: ObservationTimeBasis;
  last_update_time: string;
}

export interface SessionStateResponse {
  state_id: string;
  crop_type: CropType;
  planting_date: string;
  location: Location;
  soil_texture: SoilTexture;
  current_state: TwinCurrentState;
}

export interface SessionHistoryResponse {
  state_id: string;
  history: HistoryEvent[];
}

export interface DiseasePredictionRequest {
  state_id: string;
  image_base64: string;
  model_version: string;
}

export interface DiseasePredictionResponse {
  state_id: string;
  crop_type: CropType;
  predicted_label: string;
  disease_category: DiseaseCategory;
  class_probs: Record<string, number>;
  confidence_calibrated: number;
  uncertainty_score: number;
  uncertainty_band: UncertaintyBand;
  predicted_at: string;
}

export interface WeatherInput {
  tmin_c: number;
  tmax_c: number;
  humidity_pct: number;
  wind_speed_mps: number;
  shortwave_radiation_sum_mj_m2?: number | null;
  rainfall_mm: number;
  eto_reference_feed?: number | null;
}

export interface WeatherSnapshotResponse extends WeatherInput {
  state_id: string;
  target_date: string;
  source: "open_meteo";
  source_timezone: string;
  latitude: number;
  longitude: number;
  wind_source_height_m: number;
  wind_normalized_height_m: number;
  shortwave_radiation_sum_mj_m2: number;
  eto_reference_feed: number;
  fetched_at: string;
}

export interface LastIrrigationEvent {
  irrigation_event_id?: string | null;
  timestamp: string;
  amount_mm: number;
  source?: IrrigationEventSource;
}

export interface ComputeWaterStateRequest {
  state_id: string;
  water_update_id?: string | null;
  current_date: string;
  weather: WeatherInput;
  last_irrigation_event?: LastIrrigationEvent | null;
  observed_at?: string | null;
  base_water_observation_id?: string | null;
  base_water_sequence?: number | null;
}

export interface WaterStateResponse {
  state_id: string;
  water_observation_id?: string | null;
  water_sequence: number;
  base_water_observation_id?: string | null;
  base_water_sequence: number;
  previous_root_zone_depletion_mm: number;
  water_update_id?: string | null;
  reported_irrigation_event_id?: string | null;
  applied_irrigation_event_id?: string | null;
  effective_irrigation_mm: number;
  irrigation_event_already_accounted_for: boolean;
  crop_type: CropType;
  growth_stage: GrowthStage;
  soil_texture: SoilTexture;
  eto_computed: number;
  eto_method: EtoMethod;
  eto_reference_feed: number | null;
  eto_delta_pct: number | null;
  kc: number;
  etc: number;
  field_capacity_assumed: number;
  wilting_point_assumed: number;
  root_depth_assumed: number;
  taw: number;
  p_allowable: number;
  raw_threshold: number;
  raw_root_zone_depletion_mm: number;
  root_zone_depletion_mm: number;
  root_zone_depletion: number;
  water_surplus_mm: number;
  depletion_beyond_taw_mm: number;
  estimated_moisture_state: MoistureState;
  stress_band: StressBand;
  observed_at: string;
  computed_at: string;
  observation_time_basis: ObservationTimeBasis;
}

export interface AdvanceOneDayRequest {
  state_id: string;
  advancement_id: string;
  target_date: string;
  weather: WeatherInput;
  last_irrigation_event?: LastIrrigationEvent | null;
}

export interface UpdateTwinStateResponse {
  state_id: string;
  current_state: TwinCurrentState;
  state_history_count: number;
  snapshot_id?: string | null;
  snapshot_created: boolean;
}

export interface AdvanceOneDayResponse {
  state_id: string;
  advancement_id: string;
  target_date: string;
  advancement_created: boolean;
  water_state: WaterStateResponse;
  twin_state: UpdateTwinStateResponse;
}

export interface SimulateActionsRequest {
  state_id: string;
  actions: ActionEnum[];
}

export interface SimulatedActionResult {
  action: ActionEnum;
  projected_root_zone_depletion: number;
  projected_raw_crossing: boolean;
  projected_stress_band: StressBand;
  projected_water_use: number;
  disease_wetness_risk_note: string;
}

export interface SimulateActionsResponse {
  state_id: string;
  simulations: SimulatedActionResult[];
  simulated_at: string;
}

export interface RecommendationResponse {
  recommendation_id?: string | null;
  state_id: string;
  chosen_action: ActionEnum;
  irrigation_constraint: IrrigationConstraint;
  inspection_advisory: boolean;
  decision_reason_codes: string[];
  caution_reasons: CautionReason[];
  evidence_summary_structured: Record<string, unknown>;
  recommended_at: string;
}

export interface NarrationResponse {
  state_id: string;
  headline: string;
  rationale: string;
  caution?: string | null;
}

export interface FarmCreateRequest {
  name: string;
}

export interface FarmResponse {
  farm_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface PlotCreateRequest {
  name: string;
  location: Location;
  soil_texture: SoilTexture;
}

export interface PlotResponse {
  plot_id: string;
  farm_id: string;
  name: string;
  location: Location;
  soil_texture: SoilTexture;
  created_at: string;
  updated_at: string;
}

export interface CreateCropCycleRequest {
  crop_type: CropType;
  planting_date: string;
}

export interface ActualActionCreateRequest {
  action: ActionEnum;
  performed_at: string;
  amount_mm?: number | null;
  related_recommendation_id?: string | null;
  notes?: string | null;
}

export interface ActualActionResponse {
  actual_action_id: string;
  state_id: string;
  related_recommendation_id: string | null;
  action: ActionEnum;
  performed_at: string;
  amount_mm: number | null;
  notes: string | null;
  recorded_at: string;
}
