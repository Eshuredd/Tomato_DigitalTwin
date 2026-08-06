import { afterEach, describe, expect, it, vi } from "vitest";
import { createActualAction, createCropCycle, createFarm, createPlot, createSession, getActualActions, getHistory, getSession, getWeatherSnapshot, narrate, predictDisease, recommend, simulateActions } from "./operations";

const farm = { farm_id: "farm-1", name: "Farm", created_at: "2026-08-03T00:00:00Z", updated_at: "2026-08-03T00:00:00Z" };
const plot = { plot_id: "plot-1", farm_id: "farm-1", name: "Plot", location: { name: "Field", latitude: 17, longitude: 78 }, soil_texture: "loam", created_at: "2026-08-03T00:00:00Z", updated_at: "2026-08-03T00:00:00Z" };
const session = { state_id: "state-1", crop_type: "tomato", planting_date: "2026-08-01", location: plot.location, soil_texture: "loam", created_at: "2026-08-03T00:00:00Z" };

afterEach(() => vi.unstubAllGlobals());
function respond(payload: unknown) { const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } }))); vi.stubGlobal("fetch", fetchMock); return fetchMock; }

describe("Milestone 2 API operations", () => {
  it("uses exact farm and plot paths and bodies", async () => {
    const fetchMock = respond(farm); await createFarm({ name: "Farm" });
    expect(fetchMock).toHaveBeenLastCalledWith("http://127.0.0.1:8000/farms", expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Farm" }) }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(plot), { status: 200 }));
    await createPlot("farm/one", { name: "Plot", location: plot.location, soil_texture: "loam" });
    expect(fetchMock).toHaveBeenLastCalledWith("http://127.0.0.1:8000/farms/farm%2Fone/plots", expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Plot", location: plot.location, soil_texture: "loam" }) }));
  });

  it("uses exact standalone and plot-backed session contracts", async () => {
    const fetchMock = respond(session);
    await createSession({ crop_type: "tomato", planting_date: "2026-08-01", location: plot.location, soil_texture: "loam" });
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ crop_type: "tomato", planting_date: "2026-08-01", location: plot.location, soil_texture: "loam" });
    await createCropCycle("plot/one", { crop_type: "tomato", planting_date: "2026-08-01" });
    expect(fetchMock).toHaveBeenLastCalledWith("http://127.0.0.1:8000/plots/plot%2Fone/crop-cycles", expect.objectContaining({ method: "POST", body: JSON.stringify({ crop_type: "tomato", planting_date: "2026-08-01" }) }));
  });

  it("encodes an existing session ID", async () => {
    const loaded = { ...session, current_state: { crop_type: "tomato", growth_stage: "initial", days_since_planting: 2, predicted_label: "healthy", disease_category: "none", confidence_calibrated: 1, uncertainty_score: 0, uncertainty_band: "low", eto_computed: 1, eto_method: "penman_monteith", kc: 1, etc: 1, taw: 1, raw_threshold: 1, raw_root_zone_depletion_mm: 1, root_zone_depletion_mm: 1, root_zone_depletion: 1, water_surplus_mm: 0, depletion_beyond_taw_mm: 0, estimated_moisture_state: "adequate", stress_band: "low", observed_at: "2026-08-03T00:00:00Z", computed_at: "2026-08-03T00:00:00Z", observation_time_basis: "EXPLICIT", last_update_time: "2026-08-03T00:00:00Z" } };
    delete (loaded as Partial<typeof session>).created_at;
    const fetchMock = respond(loaded); await getSession("state/one");
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8000/sessions/state%2Fone");
  });
});

describe("Milestone 3 API operations", () => {
  const disease = { state_id: "state/one", crop_type: "tomato", predicted_label: "healthy", disease_category: "none", class_probs: { healthy: 1 }, confidence_calibrated: 1, uncertainty_score: 0, uncertainty_band: "low", predicted_at: "2026-08-04T04:00:00Z" };
  const weather = { state_id: "state/one", target_date: "2026-08-04", source: "open_meteo", source_timezone: "Asia/Kolkata", latitude: 17, longitude: 78, tmin_c: 20, tmax_c: 30, humidity_pct: 60, wind_speed_mps: 2, wind_source_height_m: 10, wind_normalized_height_m: 2, rainfall_mm: 0, shortwave_radiation_sum_mj_m2: 18, eto_reference_feed: 4, fetched_at: "2026-08-04T04:00:00Z" };

  it("sends matching encoded disease path and body state IDs", async () => {
    const fetchMock = respond(disease);
    await predictDisease("state/one", { state_id: "state/one", image_base64: "YWJj", model_version: "1.0" });
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8000/sessions/state%2Fone/predict-disease", expect.objectContaining({ method: "POST", body: JSON.stringify({ state_id: "state/one", image_base64: "YWJj", model_version: "1.0" }) }));
  });

  it("uses the exact encoded weather date query", async () => {
    const fetchMock = respond(weather);
    await getWeatherSnapshot("state/one", "2026-08-04");
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8000/sessions/state%2Fone/weather-snapshot?target_date=2026-08-04");
  });

  it("rejects mismatched disease and weather identities", async () => {
    respond({ ...disease, state_id: "other" });
    await expect(predictDisease("state/one", { state_id: "state/one", image_base64: "YWJj", model_version: "1.0" })).rejects.toMatchObject({ code: "RESPONSE_STATE_ID_MISMATCH" });
    respond({ ...weather, target_date: "2026-08-05" });
    await expect(getWeatherSnapshot("state/one", "2026-08-04")).rejects.toMatchObject({ code: "WEATHER_DATE_MISMATCH" });
  });

  it("rejects malformed probabilities and naive timestamps", async () => {
    respond({ ...disease, class_probs: { healthy: 1.2 } });
    await expect(predictDisease("state/one", { state_id: "state/one", image_base64: "YWJj", model_version: "1.0" })).rejects.toMatchObject({ code: "MALFORMED_RESPONSE" });
    respond({ ...weather, fetched_at: "2026-08-04T04:00:00" });
    await expect(getWeatherSnapshot("state/one", "2026-08-04")).rejects.toMatchObject({ code: "MALFORMED_RESPONSE" });
  });
});

describe("decision and record API operations", () => {
  const simulation = { state_id: "state/one", simulations: [
    { action: "IRRIGATE_IN_6H", projected_root_zone_depletion: 2, projected_raw_crossing: false, projected_stress_band: "low", projected_water_use: 1, disease_wetness_risk_note: "note" },
    { action: "IRRIGATE_NOW", projected_root_zone_depletion: 1, projected_raw_crossing: false, projected_stress_band: "low", projected_water_use: 2, disease_wetness_risk_note: "note" },
  ], simulated_at: "2026-08-04T04:00:00Z" };
  it("preserves exact simulation action order in the request and response", async () => { const fetchMock = respond(simulation); await simulateActions("state/one", { state_id: "state/one", actions: ["IRRIGATE_IN_6H", "IRRIGATE_NOW"] }); expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).actions).toEqual(["IRRIGATE_IN_6H", "IRRIGATE_NOW"]); });
  it("rejects empty candidates and backend reordering", async () => { respond(simulation); await expect(simulateActions("state/one", { state_id: "state/one", actions: [] })).rejects.toBeTruthy(); respond({ ...simulation, simulations: [...simulation.simulations].reverse() }); await expect(simulateActions("state/one", { state_id: "state/one", actions: ["IRRIGATE_IN_6H", "IRRIGATE_NOW"] })).rejects.toMatchObject({ code: "SIMULATION_ORDER_MISMATCH" }); });
  it("uses explicit bodyless recommendation and narration POSTs", async () => { const fetchMock = respond({ recommendation_id: "rec-1", state_id: "state/one", chosen_action: "IRRIGATE_NOW", irrigation_constraint: "NONE", inspection_advisory: false, decision_reason_codes: [], caution_reasons: [], evidence_summary_structured: {}, recommended_at: "2026-08-04T04:00:00Z" }); await recommend("state/one"); expect(fetchMock).toHaveBeenLastCalledWith("http://127.0.0.1:8000/sessions/state%2Fone/recommend", expect.objectContaining({ method: "POST", body: undefined })); fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ state_id: "state/one", headline: "Headline", rationale: "Exact rationale", caution: null }), { status: 200 })); expect((await narrate("state/one")).rationale).toBe("Exact rationale"); });
  it("validates history identity", async () => { respond({ state_id: "other", history: [] }); await expect(getHistory("state/one")).rejects.toMatchObject({ code: "RESPONSE_STATE_ID_MISMATCH" }); });
  it("uses exact list limit and preserves explicit zero in an action payload", async () => { const action = { actual_action_id: "a-1", state_id: "state/one", related_recommendation_id: null, action: "IRRIGATE_NOW", performed_at: "2026-08-04T04:00:00Z", amount_mm: 0, notes: null, recorded_at: "2026-08-04T04:01:00Z" }; const fetchMock = respond([action]); await getActualActions("state/one", 50); expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8000/sessions/state%2Fone/actual-actions?limit=50"); fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(action), { status: 200 })); await createActualAction("state/one", { action: "IRRIGATE_NOW", performed_at: "2026-08-04T04:00:00Z", amount_mm: 0 }); expect(JSON.parse((fetchMock.mock.calls.at(-1)![1] as RequestInit).body as string)).toMatchObject({ amount_mm: 0 }); });
});
