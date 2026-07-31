import { describe, expect, it, vi } from "vitest";
import {
  buildComputeWaterRequest,
  generateWaterUpdateId,
  waterUpdatePayloadSignature,
} from "./water-utils";

const weather = {
  tmin_c: 20,
  tmax_c: 31,
  humidity_pct: 60,
  wind_speed_mps: 2,
  shortwave_radiation_sum_mj_m2: 18,
  rainfall_mm: 0,
  eto_reference_feed: 4.5,
};

describe("water utilities", () => {
  it("omits base fields for the first observation", () => {
    expect(buildComputeWaterRequest({
      baseWaterObservationId: null,
      currentDate: "2026-07-31",
      lastIrrigationEvent: null,
      latestWaterSequence: 0,
      waterUpdateId: "water-1",
      weather,
    })).toEqual({
      water_update_id: "water-1",
      current_date: "2026-07-31",
      weather,
      last_irrigation_event: null,
    });
  });

  it("includes base fields after a prior water observation", () => {
    expect(buildComputeWaterRequest({
      baseWaterObservationId: "obs-1",
      currentDate: "2026-08-01",
      lastIrrigationEvent: null,
      latestWaterSequence: 1,
      waterUpdateId: "water-2",
      weather,
    })).toMatchObject({
      base_water_observation_id: "obs-1",
      base_water_sequence: 1,
    });
  });

  it("generates stable equivalent signatures despite property order", () => {
    const left = waterUpdatePayloadSignature({
      stateId: "state-a",
      payload: {
        current_date: "2026-07-31",
        weather,
        last_irrigation_event: null,
      },
    });
    const right = waterUpdatePayloadSignature({
      stateId: "state-a",
      payload: {
        last_irrigation_event: null,
        weather: {
          eto_reference_feed: 4.5,
          humidity_pct: 60,
          rainfall_mm: 0,
          shortwave_radiation_sum_mj_m2: 18,
          tmax_c: 31,
          tmin_c: 20,
          wind_speed_mps: 2,
        },
        current_date: "2026-07-31",
      },
    });
    expect(left).toBe(right);
  });

  it("uses randomUUID when available", () => {
    const randomUUID = vi.fn(() => "stable-water-id");
    vi.stubGlobal("crypto", { randomUUID });
    expect(generateWaterUpdateId()).toBe("stable-water-id");
    vi.unstubAllGlobals();
  });
});
