import { describe, expect, it, vi } from "vitest";
import type { AdvanceOneDayResponse, UpdateTwinStateResponse, WeatherInput } from "@/lib/types/api";
import {
  advancementPayloadSignature,
  buildAdvanceOneDayRequest,
  deriveNextAdvancementDate,
  evaluateAdvancementTransition,
  generateAdvancementId,
} from "./advancement-utils";

const weather: WeatherInput = {
  tmin_c: 20,
  tmax_c: 31,
  humidity_pct: 60,
  wind_speed_mps: 2,
  shortwave_radiation_sum_mj_m2: null,
  rainfall_mm: 0,
  eto_reference_feed: null,
};

const twin: UpdateTwinStateResponse = {
  state_id: "state-a",
  current_state: {
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
  },
  state_history_count: 1,
  snapshot_id: "snapshot-1",
  snapshot_created: true,
};

const response: AdvanceOneDayResponse = {
  state_id: "state-a",
  advancement_id: "advancement-1",
  target_date: "2026-08-01",
  advancement_created: true,
  water_state: {
    state_id: "state-a",
    water_observation_id: "water-2",
    water_sequence: 2,
    base_water_observation_id: "water-1",
    base_water_sequence: 1,
    previous_root_zone_depletion_mm: 8,
    water_update_id: "water-update-2",
    reported_irrigation_event_id: null,
    applied_irrigation_event_id: null,
    effective_irrigation_mm: 0,
    irrigation_event_already_accounted_for: false,
    crop_type: "tomato",
    growth_stage: "development",
    soil_texture: "sandy_loam",
    eto_computed: 4,
    eto_method: "penman_monteith",
    eto_reference_feed: null,
    eto_delta_pct: null,
    kc: 0.8,
    etc: 3.2,
    field_capacity_assumed: 0.22,
    wilting_point_assumed: 0.1,
    root_depth_assumed: 400,
    taw: 48,
    p_allowable: 0.5,
    raw_threshold: 24,
    raw_root_zone_depletion_mm: 8,
    root_zone_depletion_mm: 8,
    root_zone_depletion: 8,
    water_surplus_mm: 0,
    depletion_beyond_taw_mm: 0,
    estimated_moisture_state: "adequate",
    stress_band: "low",
    observed_at: "2026-08-01T00:00:00Z",
    computed_at: "2026-08-01T01:00:00Z",
    observation_time_basis: "DATE_ONLY_UTC_START",
  },
  twin_state: { ...twin, snapshot_id: "snapshot-2" },
};

describe("advancement utilities", () => {
  it("builds stable payload signatures independent of key order", () => {
    const first = advancementPayloadSignature({
      irrigationEvent: null,
      stateId: "state-a",
      targetDate: "2026-08-01",
      weather,
    });
    const second = advancementPayloadSignature({
      irrigationEvent: null,
      stateId: "state-a",
      targetDate: "2026-08-01",
      weather: { rainfall_mm: 0, wind_speed_mps: 2, humidity_pct: 60, tmax_c: 31, tmin_c: 20, eto_reference_feed: null, shortwave_radiation_sum_mj_m2: null },
    });
    const changed = advancementPayloadSignature({
      irrigationEvent: null,
      stateId: "state-a",
      targetDate: "2026-08-02",
      weather,
    });

    expect(first).toBe(second);
    expect(first).not.toBe(changed);
  });

  it("includes irrigation events in the stable signature", () => {
    const noIrrigation = advancementPayloadSignature({
      irrigationEvent: null,
      stateId: "state-a",
      targetDate: "2026-08-01",
      weather,
    });
    const irrigated = advancementPayloadSignature({
      irrigationEvent: {
        irrigation_event_id: "event-1",
        timestamp: "2026-08-01T06:00:00Z",
        amount_mm: 5,
        source: "MANUAL",
      },
      stateId: "state-a",
      targetDate: "2026-08-01",
      weather,
    });

    expect(noIrrigation).not.toBe(irrigated);
  });

  it("generates advancement IDs on demand", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");

    expect(generateAdvancementId()).toBe("00000000-0000-4000-8000-000000000001");
  });

  it("builds the request body without state_id", () => {
    expect(buildAdvanceOneDayRequest({
      advancementId: "advancement-1",
      irrigationEvent: null,
      targetDate: "2026-08-01",
      weather,
    })).toEqual({
      advancement_id: "advancement-1",
      target_date: "2026-08-01",
      weather,
      last_irrigation_event: null,
    });
  });

  it("derives next dates across month, year and leap boundaries", () => {
    expect(deriveNextAdvancementDate("2026-07-31T00:00:00Z")).toBe("2026-08-01");
    expect(deriveNextAdvancementDate("2026-12-31T00:00:00Z")).toBe("2027-01-01");
    expect(deriveNextAdvancementDate("2028-02-28T00:00:00Z")).toBe("2028-02-29");
    expect(deriveNextAdvancementDate("bad")).toBeNull();
  });

  it("categorizes new advancement", () => {
    expect(evaluateAdvancementTransition({
      advancementCreated: true,
      currentSequence: 1,
      currentTwin: twin,
      response,
    })).toMatchObject({
      kind: "new_advancement",
      replaceCanonicalWater: true,
      replaceTwinFromResponse: true,
      refreshAuthoritativeTwin: false,
    });
  });

  it("categorizes catch-up retry", () => {
    expect(evaluateAdvancementTransition({
      advancementCreated: false,
      currentSequence: 1,
      currentTwin: twin,
      response: { ...response, advancement_created: false },
    })).toMatchObject({
      kind: "catch_up_retry",
      replaceCanonicalWater: true,
      invalidateCurrentTwin: true,
      refreshAuthoritativeTwin: true,
    });
  });

  it("categorizes current retry with and without a local twin", () => {
    const currentResponse = {
      ...response,
      advancement_created: false,
      water_state: { ...response.water_state, water_sequence: 1 },
    };

    expect(evaluateAdvancementTransition({
      advancementCreated: false,
      currentSequence: 1,
      currentTwin: twin,
      response: currentResponse,
    })).toMatchObject({
      kind: "current_retry",
      refreshAuthoritativeTwin: false,
      replaceTwinFromResponse: false,
      retainResponse: true,
    });
    expect(evaluateAdvancementTransition({
      advancementCreated: false,
      currentSequence: 1,
      currentTwin: null,
      response: currentResponse,
    })).toMatchObject({
      kind: "current_retry",
      refreshAuthoritativeTwin: true,
      invalidateCurrentTwin: true,
    });
  });

  it("categorizes historical and malformed retries conservatively", () => {
    expect(evaluateAdvancementTransition({
      advancementCreated: false,
      currentSequence: 3,
      currentTwin: twin,
      response: { ...response, advancement_created: false },
    })).toMatchObject({
      kind: "historical_retry",
      replaceCanonicalWater: false,
      retainResponse: true,
    });

    for (const water_sequence of [undefined, false, -1, 1.5]) {
      expect(evaluateAdvancementTransition({
        advancementCreated: false,
        currentSequence: 1,
        currentTwin: twin,
        response: {
          ...response,
          advancement_created: false,
          water_state: { ...response.water_state, water_sequence } as never,
        },
      })).toMatchObject({
        kind: "malformed_retry",
        replaceCanonicalWater: false,
        refreshAuthoritativeTwin: false,
        retainResponse: true,
      });
    }
  });
});
