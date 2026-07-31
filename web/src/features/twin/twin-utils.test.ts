import { describe, expect, it } from "vitest";
import type {
  DiseasePredictionResponse,
  WaterStateResponse,
  WeatherInput,
} from "@/lib/types/api";
import { twinSourceSignature } from "./twin-utils";

const disease: DiseasePredictionResponse = {
  state_id: "state-a",
  crop_type: "tomato",
  predicted_label: "Tomato___healthy",
  disease_category: "none",
  class_probs: {
    Tomato___healthy: 0.9,
    Tomato___Late_blight: 0.1,
  },
  confidence_calibrated: 0.9,
  uncertainty_score: 0.1,
  uncertainty_band: "low",
  predicted_at: "2026-07-31T00:00:00Z",
};

const water: WaterStateResponse = {
  state_id: "state-a",
  water_observation_id: "water-observation-1",
  water_sequence: 1,
  base_water_observation_id: null,
  base_water_sequence: 0,
  previous_root_zone_depletion_mm: 0,
  water_update_id: "water-update-1",
  reported_irrigation_event_id: null,
  applied_irrigation_event_id: null,
  effective_irrigation_mm: 0,
  irrigation_event_already_accounted_for: false,
  crop_type: "tomato",
  growth_stage: "development",
  soil_texture: "sandy_loam",
  eto_computed: 4,
  eto_method: "penman_monteith",
  eto_reference_feed: 4.5,
  eto_delta_pct: null,
  kc: 0.8,
  etc: 3.2,
  field_capacity_assumed: 0.22,
  wilting_point_assumed: 0.1,
  root_depth_assumed: 400,
  taw: 48,
  p_allowable: 0.5,
  raw_threshold: 24,
  raw_root_zone_depletion_mm: 0,
  root_zone_depletion_mm: 0,
  root_zone_depletion: 0,
  water_surplus_mm: 0,
  depletion_beyond_taw_mm: 0,
  estimated_moisture_state: "adequate",
  stress_band: "low",
  observed_at: "2026-07-31T00:00:00Z",
  computed_at: "2026-07-31T01:00:00Z",
  observation_time_basis: "DATE_ONLY_UTC_START",
};

const weatherDraft: WeatherInput = {
  tmin_c: 20,
  tmax_c: 31,
  humidity_pct: 60,
  wind_speed_mps: 2,
  shortwave_radiation_sum_mj_m2: 18,
  rainfall_mm: 0,
  eto_reference_feed: 4.5,
};

describe("twinSourceSignature", () => {
  it("returns the same signature for the same logical sources", () => {
    expect(twinSourceSignature({ disease, stateId: "state-a", water })).toBe(
      twinSourceSignature({ disease: { ...disease }, stateId: "state-a", water: { ...water } }),
    );
  });

  it("is stable despite object-key order", () => {
    const reorderedDisease = {
      predicted_at: disease.predicted_at,
      uncertainty_band: disease.uncertainty_band,
      uncertainty_score: disease.uncertainty_score,
      class_probs: {
        Tomato___Late_blight: 0.1,
        Tomato___healthy: 0.9,
      },
      state_id: disease.state_id,
      predicted_label: disease.predicted_label,
      disease_category: disease.disease_category,
      confidence_calibrated: disease.confidence_calibrated,
      crop_type: disease.crop_type,
    } as DiseasePredictionResponse;

    expect(twinSourceSignature({ disease, stateId: "state-a", water })).toBe(
      twinSourceSignature({ disease: reorderedDisease, stateId: "state-a", water }),
    );
  });

  it("changes when disease timestamp changes", () => {
    expect(twinSourceSignature({ disease, stateId: "state-a", water })).not.toBe(
      twinSourceSignature({
        disease: { ...disease, predicted_at: "2026-08-01T00:00:00Z" },
        stateId: "state-a",
        water,
      }),
    );
  });

  it("changes when disease label changes", () => {
    expect(twinSourceSignature({ disease, stateId: "state-a", water })).not.toBe(
      twinSourceSignature({
        disease: { ...disease, predicted_label: "Tomato___Late_blight" },
        stateId: "state-a",
        water,
      }),
    );
  });

  it("changes when water observation ID changes", () => {
    expect(twinSourceSignature({ disease, stateId: "state-a", water })).not.toBe(
      twinSourceSignature({
        disease,
        stateId: "state-a",
        water: { ...water, water_observation_id: "water-observation-2" },
      }),
    );
  });

  it("changes when water sequence changes", () => {
    expect(twinSourceSignature({ disease, stateId: "state-a", water })).not.toBe(
      twinSourceSignature({
        disease,
        stateId: "state-a",
        water: { ...water, water_sequence: 2 },
      }),
    );
  });

  it("changes when water update ID changes", () => {
    expect(twinSourceSignature({ disease, stateId: "state-a", water })).not.toBe(
      twinSourceSignature({
        disease,
        stateId: "state-a",
        water: { ...water, water_update_id: "water-update-2" },
      }),
    );
  });

  it("does not include weather draft values", () => {
    const signature = twinSourceSignature({ disease, stateId: "state-a", water });
    const changedDraft = { ...weatherDraft, rainfall_mm: 10 };

    expect(changedDraft.rainfall_mm).toBe(10);
    expect(twinSourceSignature({ disease, stateId: "state-a", water })).toBe(signature);
  });

  it("does not include image bytes", () => {
    expect(twinSourceSignature({ disease, stateId: "state-a", water })).not.toContain("image_base64");
  });
});
