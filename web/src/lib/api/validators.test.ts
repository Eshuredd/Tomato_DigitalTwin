import { describe, expect, it } from "vitest";
import {
  parseAdvanceOneDayResponse,
  parseTwinCurrentState,
  parseUpdateTwinStateResponse,
  parseWaterStateResponse,
} from "./validators";
import { CropTwinApiError } from "./errors";
import type { GrowthStage } from "@/lib/types/api";

const currentState = {
  crop_type: "tomato",
  growth_stage: "development",
  days_since_planting: 30,
  predicted_label: "Tomato___healthy",
  disease_category: "none",
  confidence_calibrated: 0.9,
  uncertainty_score: 0.1,
  uncertainty_band: "low",
  eto_computed: 4,
  eto_method: "penman_monteith",
  kc: 0.8,
  etc: 3.2,
  taw: 48,
  raw_threshold: 24,
  raw_root_zone_depletion_mm: 8,
  root_zone_depletion_mm: 8,
  root_zone_depletion: 8,
  water_surplus_mm: 0,
  depletion_beyond_taw_mm: 0,
  estimated_moisture_state: "adequate",
  stress_band: "low",
  observed_at: "2026-07-31T00:00:00Z",
  computed_at: "2026-07-31T01:00:00Z",
  observation_time_basis: "DATE_ONLY_UTC_START",
  last_update_time: "2026-07-31T01:00:00Z",
};

const waterState = {
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

const twinResponse = {
  state_id: "state-a",
  current_state: currentState,
  state_history_count: 1,
  snapshot_id: "snapshot-1",
  snapshot_created: true,
};

const advancementResponse = {
  state_id: "state-a",
  advancement_id: "advancement-1",
  target_date: "2026-08-01",
  advancement_created: true,
  water_state: {
    ...waterState,
    water_observation_id: "water-observation-2",
    water_sequence: 2,
    base_water_observation_id: "water-observation-1",
    base_water_sequence: 1,
    observed_at: "2026-08-01T00:00:00Z",
  },
  twin_state: {
    ...twinResponse,
    snapshot_id: "snapshot-2",
    current_state: {
      ...currentState,
      observed_at: "2026-08-01T00:00:00Z",
      last_update_time: "2026-08-01T01:00:00Z",
    },
  },
};

describe("parseWaterStateResponse", () => {
  it("accepts a valid first observation", () => {
    expect(parseWaterStateResponse({
      ...waterState,
      water_sequence: 1,
      base_water_observation_id: null,
      base_water_sequence: 0,
    })).toMatchObject({ state_id: "state-a", water_sequence: 1 });
  });

  it("accepts a valid later observation", () => {
    expect(parseWaterStateResponse({
      ...waterState,
      water_observation_id: "water-observation-2",
      water_sequence: 2,
      base_water_observation_id: "water-observation-1",
      base_water_sequence: 1,
    })).toMatchObject({ base_water_sequence: 1 });
  });

  it("accepts every supported growth stage", () => {
    const stages: GrowthStage[] = ["initial", "development", "mid_season", "late_season"];
    for (const growth_stage of stages) {
      expect(parseWaterStateResponse({ ...waterState, growth_stage }).growth_stage).toBe(growth_stage);
    }
  });

  it("rejects invalid growth stage", () => {
    expect(() => parseWaterStateResponse({ ...waterState, growth_stage: "flowering" })).toThrow("water state");
  });

  it("rejects invalid ETo method", () => {
    expect(() => parseWaterStateResponse({ ...waterState, eto_method: "manual" })).toThrow("water state");
  });

  it("rejects invalid moisture state", () => {
    expect(() => parseWaterStateResponse({ ...waterState, estimated_moisture_state: "wet" })).toThrow("water state");
  });

  it("rejects invalid stress band", () => {
    expect(() => parseWaterStateResponse({ ...waterState, stress_band: "severe" })).toThrow("water state");
  });

  it("rejects invalid observation-time basis", () => {
    expect(() => parseWaterStateResponse({ ...waterState, observation_time_basis: "LOCAL" })).toThrow("water state");
  });

  it("rejects malformed observed_at", () => {
    expect(() => parseWaterStateResponse({ ...waterState, observed_at: "2026-02-30T00:00:00Z" })).toThrow("water state");
  });

  it("rejects malformed computed_at", () => {
    expect(() => parseWaterStateResponse({ ...waterState, computed_at: "2026-07-31T00:00:00" })).toThrow("water state");
  });

  it("rejects negative sequence", () => {
    expect(() => parseWaterStateResponse({ ...waterState, water_sequence: -1 })).toThrow("water state");
  });

  it("rejects empty non-null observation ID", () => {
    expect(() => parseWaterStateResponse({ ...waterState, water_observation_id: " " })).toThrow("water state");
  });

  it("rejects non-finite numeric values", () => {
    expect(() => parseWaterStateResponse({ ...waterState, eto_computed: Infinity })).toThrow("water state");
  });

  it("accepts valid timezone-aware backend timestamps without transforming them", () => {
    const observed_at = "2026-07-31T05:30:00+05:30";
    expect(parseWaterStateResponse({ ...waterState, observed_at }).observed_at).toBe(observed_at);
  });

  it("does not reject additional fields", () => {
    expect(parseWaterStateResponse({ ...waterState, extra: "kept" })).toMatchObject({ extra: "kept" });
  });
});

describe("twin validators", () => {
  it("accepts a valid newly created snapshot", () => {
    expect(parseUpdateTwinStateResponse(twinResponse)).toMatchObject({
      snapshot_created: true,
      snapshot_id: "snapshot-1",
    });
  });

  it("accepts a valid reused snapshot", () => {
    expect(parseUpdateTwinStateResponse({
      ...twinResponse,
      snapshot_created: false,
    }).snapshot_created).toBe(false);
  });

  it("rejects missing current_state", () => {
    expect(() => parseUpdateTwinStateResponse({
      ...twinResponse,
      current_state: undefined,
    })).toThrow("twin current-state");
  });

  it("rejects invalid nested growth stage", () => {
    expect(() => parseUpdateTwinStateResponse({
      ...twinResponse,
      current_state: { ...currentState, growth_stage: "fruiting" },
    })).toThrow("twin current-state");
  });

  it("rejects invalid nested timestamp", () => {
    expect(() => parseUpdateTwinStateResponse({
      ...twinResponse,
      current_state: { ...currentState, last_update_time: "2026-13-01T00:00:00Z" },
    })).toThrow("twin current-state");
  });

  it("rejects negative planting age", () => {
    expect(() => parseUpdateTwinStateResponse({
      ...twinResponse,
      current_state: { ...currentState, days_since_planting: -1 },
    })).toThrow("twin current-state");
  });

  it("rejects negative history count", () => {
    expect(() => parseUpdateTwinStateResponse({ ...twinResponse, state_history_count: -1 })).toThrow("twin-state update");
  });

  it("rejects empty non-null snapshot ID", () => {
    expect(() => parseUpdateTwinStateResponse({ ...twinResponse, snapshot_id: " " })).toThrow("twin-state update");
  });

  it("rejects non-boolean snapshot_created", () => {
    expect(() => parseUpdateTwinStateResponse({ ...twinResponse, snapshot_created: "yes" })).toThrow("twin-state update");
  });

  it("rejects malformed state ID", () => {
    expect(() => parseUpdateTwinStateResponse({ ...twinResponse, state_id: "" })).toThrow("twin-state update");
  });

  it("does not reject additional valid fields", () => {
    expect(parseUpdateTwinStateResponse({ ...twinResponse, extra: "kept" })).toMatchObject({ extra: "kept" });
  });

  it("parses TwinCurrentState directly", () => {
    expect(parseTwinCurrentState(currentState).predicted_label).toBe("Tomato___healthy");
  });
});

describe("advancement validators", () => {
  it("accepts a valid one-day advancement response", () => {
    expect(parseAdvanceOneDayResponse(advancementResponse)).toMatchObject({
      state_id: "state-a",
      advancement_id: "advancement-1",
      advancement_created: true,
      water_state: { water_sequence: 2 },
      twin_state: { snapshot_id: "snapshot-2" },
    });
  });

  it("accepts reused advancement responses", () => {
    expect(parseAdvanceOneDayResponse({
      ...advancementResponse,
      advancement_created: false,
    }).advancement_created).toBe(false);
  });

  it("rejects malformed target dates", () => {
    expect(() => parseAdvanceOneDayResponse({
      ...advancementResponse,
      target_date: "2026-02-30",
    })).toThrow("one-day advancement");
  });

  it("rejects missing or empty advancement IDs", () => {
    expect(() => parseAdvanceOneDayResponse({
      ...advancementResponse,
      advancement_id: " ",
    })).toThrow("one-day advancement");
  });

  it("rejects non-boolean created flags", () => {
    expect(() => parseAdvanceOneDayResponse({
      ...advancementResponse,
      advancement_created: "false",
    })).toThrow("one-day advancement");
  });

  it("rejects malformed nested water state", () => {
    expect(() => parseAdvanceOneDayResponse({
      ...advancementResponse,
      water_state: { ...advancementResponse.water_state, water_sequence: 2.5 },
    })).toThrow("water state");
  });

  it("rejects malformed nested twin state", () => {
    expect(() => parseAdvanceOneDayResponse({
      ...advancementResponse,
      twin_state: { ...advancementResponse.twin_state, snapshot_created: "yes" },
    })).toThrow("twin-state update");
  });

  it("rejects mismatched nested water state IDs", () => {
    try {
      parseAdvanceOneDayResponse({
        ...advancementResponse,
        water_state: { ...advancementResponse.water_state, state_id: "state-b" },
      });
      throw new Error("Expected mismatched water state ID to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(CropTwinApiError);
      expect((error as CropTwinApiError).kind).toBe("malformed");
      expect((error as CropTwinApiError).code).toBe("FRONTEND_MALFORMED_RESPONSE");
      expect((error as CropTwinApiError).message).toContain("mismatched nested state IDs");
    }
  });

  it("rejects mismatched nested twin state IDs", () => {
    try {
      parseAdvanceOneDayResponse({
        ...advancementResponse,
        twin_state: { ...advancementResponse.twin_state, state_id: "state-b" },
      });
      throw new Error("Expected mismatched twin state ID to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(CropTwinApiError);
      expect((error as CropTwinApiError).kind).toBe("malformed");
      expect((error as CropTwinApiError).code).toBe("FRONTEND_MALFORMED_RESPONSE");
      expect((error as CropTwinApiError).message).toContain("mismatched nested state IDs");
    }
  });
});
