import { describe, expect, it } from "vitest";
import type { AcceptedWeather } from "../weather/weather-draft";
import { buildComputeWaterRequest, buildWaterSemanticPayload, waterBaseline, waterPayloadSignature, type WaterStateResponse } from "./water-utils";
const acceptedWeather: AcceptedWeather = { stateId: "state-1", targetDate: "2026-08-04", provenance: "manual", weather: { tmin_c: 0, tmax_c: 30, humidity_pct: 0, wind_speed_mps: 0, shortwave_radiation_sum_mj_m2: null, rainfall_mm: 0, eto_reference_feed: null }, overrideFlags: { tmin_c: false, tmax_c: false, humidity_pct: false, wind_speed_mps: false, shortwave_radiation_sum_mj_m2: false, rainfall_mm: false, eto_reference_feed: false }, signature: "weather" };
describe("water request construction", () => {
  it("omits both unknown baseline fields and observed_at", () => { const request = buildComputeWaterRequest(buildWaterSemanticPayload("state-1", acceptedWeather, null), "update-1"); expect(request).toEqual({ state_id: "state-1", water_update_id: "update-1", current_date: "2026-08-04", weather: acceptedWeather.weather, last_irrigation_event: null }); expect(request).not.toHaveProperty("observed_at"); });
  it("supplies known baseline fields as a pair without incrementing", () => expect(buildWaterSemanticPayload("state-1", acceptedWeather, null, { observationId: "water-4", sequence: 4 })).toMatchObject({ base_water_observation_id: "water-4", base_water_sequence: 4 }));
  it("uses exact zero and null weather values in its signature", () => expect(waterPayloadSignature(buildWaterSemanticPayload("state-1", acceptedWeather, null))).toContain('"tmin_c":0'));
  it("separates state IDs", () => expect(waterPayloadSignature(buildWaterSemanticPayload("state-1", acceptedWeather, null))).not.toBe(waterPayloadSignature(buildWaterSemanticPayload("state-2", acceptedWeather, null))));
  it("blocks positive sequence without an observation ID", () => expect(() => waterBaseline({ water_sequence: 1, water_observation_id: null } as WaterStateResponse)).toThrow(/inconsistent/i));
  it("blocks an ID paired with sequence zero", () => expect(() => waterBaseline({ water_sequence: 0, water_observation_id: "water-0" } as WaterStateResponse)).toThrow(/inconsistent/i));
});
