import { describe, expect, it } from "vitest";
import {
  detectWeatherOverrides,
  initialWeatherDate,
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

  it("accepts both optional values when present", () => {
    expect(parseWeatherDraft({
      tmin_c: "20",
      tmax_c: "31",
      humidity_pct: "60",
      wind_speed_mps: "2",
      shortwave_radiation_sum_mj_m2: "18",
      rainfall_mm: "0",
      eto_reference_feed: "4.5",
    })).toMatchObject({
      shortwave_radiation_sum_mj_m2: 18,
      eto_reference_feed: 4.5,
    });
  });

  it("parses blank optional radiation as null", () => {
    expect(parseWeatherDraft({
      tmin_c: "20",
      tmax_c: "31",
      humidity_pct: "60",
      wind_speed_mps: "2",
      shortwave_radiation_sum_mj_m2: "   ",
      rainfall_mm: "0",
      eto_reference_feed: "4.5",
    }).shortwave_radiation_sum_mj_m2).toBeNull();
  });

  it("parses blank optional reference ETo as null", () => {
    expect(parseWeatherDraft({
      tmin_c: "20",
      tmax_c: "31",
      humidity_pct: "60",
      wind_speed_mps: "2",
      shortwave_radiation_sum_mj_m2: "18",
      rainfall_mm: "0",
      eto_reference_feed: "",
    }).eto_reference_feed).toBeNull();
  });

  it("parses both blank optional values as null", () => {
    expect(parseWeatherDraft({
      tmin_c: "20",
      tmax_c: "31",
      humidity_pct: "60",
      wind_speed_mps: "2",
      shortwave_radiation_sum_mj_m2: "",
      rainfall_mm: "0",
      eto_reference_feed: "",
    })).toMatchObject({
      shortwave_radiation_sum_mj_m2: null,
      eto_reference_feed: null,
    });
  });

  it("preserves optional zero values", () => {
    expect(parseWeatherDraft({
      tmin_c: "20",
      tmax_c: "31",
      humidity_pct: "60",
      wind_speed_mps: "2",
      shortwave_radiation_sum_mj_m2: "0",
      rainfall_mm: "0",
      eto_reference_feed: "0",
    })).toMatchObject({
      shortwave_radiation_sum_mj_m2: 0,
      eto_reference_feed: 0,
    });
  });

  it("rejects malformed optional values", () => {
    expect(() => parseWeatherDraft({
      tmin_c: "20",
      tmax_c: "31",
      humidity_pct: "60",
      wind_speed_mps: "2",
      shortwave_radiation_sum_mj_m2: "sunny",
      rainfall_mm: "0",
      eto_reference_feed: "4.5",
    })).toThrow("finite number");
  });

  it("rejects negative radiation", () => {
    expect(() => parseWeatherDraft({
      tmin_c: "20",
      tmax_c: "31",
      humidity_pct: "60",
      wind_speed_mps: "2",
      shortwave_radiation_sum_mj_m2: "-1",
      rainfall_mm: "0",
      eto_reference_feed: "4.5",
    })).toThrow("must be >= 0");
  });

  it("rejects Infinity", () => {
    expect(() => parseWeatherDraft({
      tmin_c: "20",
      tmax_c: "31",
      humidity_pct: "60",
      wind_speed_mps: "2",
      shortwave_radiation_sum_mj_m2: "Infinity",
      rainfall_mm: "0",
      eto_reference_feed: "4.5",
    })).toThrow("finite number");
  });

  it("detects manual overrides against fetched values", () => {
    expect(detectWeatherOverrides({
      ...weatherInputFromSnapshot(snapshot),
      rainfall_mm: 5,
    }, snapshot).rainfall_mm).toBe(true);
  });

  it("uses today when no planting date exists", () => {
    expect(initialWeatherDate(null, "2026-07-31")).toBe("2026-07-31");
  });

  it("uses today when the planting date is in the past", () => {
    expect(initialWeatherDate("2026-07-01", "2026-07-31")).toBe("2026-07-31");
  });

  it("uses today when the planting date is today", () => {
    expect(initialWeatherDate("2026-07-31", "2026-07-31")).toBe("2026-07-31");
  });

  it("uses the planting date when it is in the future", () => {
    expect(initialWeatherDate("2026-08-05", "2026-07-31")).toBe("2026-08-05");
  });

  it("handles month boundaries", () => {
    expect(initialWeatherDate("2026-08-01", "2026-07-31")).toBe("2026-08-01");
  });

  it("handles year boundaries", () => {
    expect(initialWeatherDate("2027-01-01", "2026-12-31")).toBe("2027-01-01");
  });
});
