import { describe, expect, it } from "vitest";
import {
  detectWeatherOverrides,
  parseWeatherDraft,
  weatherInputFromSnapshot,
} from "./weather-utils";
import type { WeatherSnapshotResponse } from "@/lib/types/api";

const snapshot: WeatherSnapshotResponse = {
  state_id: "state-a",
  target_date: "2026-07-31",
  source: "open_meteo",
  source_timezone: "UTC",
  latitude: 17,
  longitude: 78,
  tmin_c: 20,
  tmax_c: 31,
  humidity_pct: 60,
  wind_speed_mps: 2,
  wind_source_height_m: 10,
  wind_normalized_height_m: 2,
  rainfall_mm: 0,
  shortwave_radiation_sum_mj_m2: 18,
  eto_reference_feed: 4.5,
  fetched_at: "2026-07-31T00:00:00Z",
};

describe("weather utilities", () => {
  it("maps snapshots to backend WeatherInput exactly", () => {
    expect(weatherInputFromSnapshot(snapshot)).toEqual({
      tmin_c: 20,
      tmax_c: 31,
      humidity_pct: 60,
      wind_speed_mps: 2,
      shortwave_radiation_sum_mj_m2: 18,
      rainfall_mm: 0,
      eto_reference_feed: 4.5,
    });
  });

  it("accepts zero rainfall as valid", () => {
    expect(parseWeatherDraft({
      tmin_c: "20",
      tmax_c: "31",
      humidity_pct: "60",
      wind_speed_mps: "0",
      shortwave_radiation_sum_mj_m2: "18",
      rainfall_mm: "0",
      eto_reference_feed: "4.5",
    }).rainfall_mm).toBe(0);
  });

  it("detects manual overrides against fetched values", () => {
    expect(detectWeatherOverrides({
      ...weatherInputFromSnapshot(snapshot),
      rainfall_mm: 5,
    }, snapshot).rainfall_mm).toBe(true);
  });
});
