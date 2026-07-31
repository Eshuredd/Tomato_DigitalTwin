import { describe, expect, it, vi } from "vitest";
import { CropTwinApiClient } from "./client";
import { CropTwinEndpoints } from "./endpoints";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const sessionStateResponse = {
  state_id: "state 1/2",
  crop_type: "tomato",
  planting_date: "2026-07-01",
  location: { name: "Farm", latitude: 17, longitude: 78, elevation_m: null },
  soil_texture: "sandy_loam",
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
    computed_at: "2026-07-31T00:00:00Z",
    observation_time_basis: "DATE_ONLY_UTC_START",
    last_update_time: "2026-07-31T00:00:00Z",
  },
};

const diseaseResponse = {
  state_id: "state 1/2",
  crop_type: "tomato",
  predicted_label: "Tomato___Late_blight",
  disease_category: "fungal",
  class_probs: { Tomato___Late_blight: 0.91 },
  confidence_calibrated: 0.91,
  uncertainty_score: 0.09,
  uncertainty_band: "low",
  predicted_at: "2026-07-31T00:00:00Z",
};

const weatherResponse = {
  state_id: "state 1/2",
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

const weatherRequest = {
  tmin_c: 20,
  tmax_c: 31,
  humidity_pct: 60,
  wind_speed_mps: 2,
  shortwave_radiation_sum_mj_m2: null,
  rainfall_mm: 0,
  eto_reference_feed: null,
};

const waterResponse = {
  state_id: "state 1/2",
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
  state_id: "state 1/2",
  current_state: sessionStateResponse.current_state,
  state_history_count: 1,
  snapshot_id: "snapshot-1",
  snapshot_created: true,
};

const advancementResponse = {
  state_id: "state 1/2",
  advancement_id: "advancement-1",
  target_date: "2026-08-01",
  advancement_created: true,
  water_state: {
    ...waterResponse,
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
      ...sessionStateResponse.current_state,
      observed_at: "2026-08-01T00:00:00Z",
      last_update_time: "2026-08-01T01:00:00Z",
    },
  },
};

describe("CropTwinEndpoints", () => {
  it("URL encodes state IDs in endpoint paths", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ state_id: "state 1/2", history: [] }));
    const endpoints = new CropTwinEndpoints(new CropTwinApiClient({ baseUrl: "http://api", fetcher }));

    await endpoints.getSessionHistory("state 1/2");

    expect(fetcher).toHaveBeenCalledWith(
      "http://api/sessions/state%201%2F2/history",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("uses no-store for GET session", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(sessionStateResponse));
    const endpoints = new CropTwinEndpoints(new CropTwinApiClient({ baseUrl: "http://api", fetcher }));

    await endpoints.getSession("state 1/2");

    expect(fetcher).toHaveBeenCalledWith(
      "http://api/sessions/state%201%2F2",
      expect.objectContaining({ cache: "no-store", method: "GET" }),
    );
  });

  it("uses no-store for POST disease prediction", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(diseaseResponse));
    const endpoints = new CropTwinEndpoints(new CropTwinApiClient({ baseUrl: "http://api", fetcher }));

    await endpoints.predictDisease("state 1/2", {
      image_base64: "abc",
      model_version: "1.0",
    });

    expect(fetcher).toHaveBeenCalledWith(
      "http://api/sessions/state%201%2F2/predict-disease",
      expect.objectContaining({
        cache: "no-store",
        method: "POST",
      }),
    );
  });

  it("passes cancellation options to weather snapshot requests", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(weatherResponse));
    const endpoints = new CropTwinEndpoints(new CropTwinApiClient({ baseUrl: "http://api", fetcher }));
    const controller = new AbortController();

    await endpoints.getWeatherSnapshot("state 1/2", "2026-07-31", {
      signal: controller.signal,
      timeoutMs: 5000,
    });

    expect(fetcher).toHaveBeenCalledWith(
      "http://api/sessions/state%201%2F2/weather-snapshot?target_date=2026-07-31",
      expect.objectContaining({
        method: "GET",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("passes cancellation options to water computation requests", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(waterResponse));
    const endpoints = new CropTwinEndpoints(new CropTwinApiClient({ baseUrl: "http://api", fetcher }));
    const controller = new AbortController();

    await endpoints.computeWaterState(
      "state 1/2",
      {
        water_update_id: "water-update-1",
        current_date: "2026-07-31",
        weather: {
          tmin_c: 20,
          tmax_c: 31,
          humidity_pct: 60,
          wind_speed_mps: 2,
          shortwave_radiation_sum_mj_m2: null,
          rainfall_mm: 0,
          eto_reference_feed: null,
        },
        last_irrigation_event: null,
      },
      { signal: controller.signal, timeoutMs: 5000 },
    );

    expect(fetcher).toHaveBeenCalledWith(
      "http://api/sessions/state%201%2F2/compute-water-state",
      expect.objectContaining({
        method: "POST",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("posts exact twin update path, method and body with encoded state ID", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(twinResponse));
    const endpoints = new CropTwinEndpoints(new CropTwinApiClient({ baseUrl: "http://api", fetcher }));

    await endpoints.updateTwinState("state 1/2");

    expect(fetcher).toHaveBeenCalledWith(
      "http://api/sessions/state%201%2F2/update-twin-state",
      expect.objectContaining({
        cache: "no-store",
        method: "POST",
        body: JSON.stringify({ state_id: "state 1/2" }),
      }),
    );
  });

  it("parses twin update responses and rejects malformed JSON shapes", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ ...twinResponse, current_state: { ...sessionStateResponse.current_state, growth_stage: "bad" } }),
    );
    const endpoints = new CropTwinEndpoints(new CropTwinApiClient({ baseUrl: "http://api", fetcher }));

    await expect(endpoints.updateTwinState("state 1/2")).rejects.toMatchObject({
      code: "FRONTEND_MALFORMED_RESPONSE",
      kind: "malformed",
    });
  });

  it("supports caller abort for twin updates", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const endpoints = new CropTwinEndpoints(new CropTwinApiClient({ baseUrl: "http://api", fetcher }));
    const request = endpoints.updateTwinState("state 1/2", { signal: controller.signal });

    controller.abort();

    await expect(request).rejects.toMatchObject({
      code: "FRONTEND_REQUEST_ABORTED",
      kind: "abort",
    });
  });

  it("forwards twin update timeout options", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn<typeof fetch>().mockImplementation(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          }),
      );
      const endpoints = new CropTwinEndpoints(new CropTwinApiClient({ baseUrl: "http://api", fetcher, timeoutMs: 30_000 }));
      const request = endpoints.updateTwinState("state 1/2", { timeoutMs: 5 });
      const assertion = expect(request).rejects.toMatchObject({
        code: "FRONTEND_REQUEST_TIMEOUT",
        kind: "timeout",
      });

      await vi.advanceTimersByTimeAsync(6);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not automatically retry failed twin update POST requests", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline"));
    const endpoints = new CropTwinEndpoints(new CropTwinApiClient({ baseUrl: "http://api", fetcher }));

    await expect(endpoints.updateTwinState("state 1/2")).rejects.toMatchObject({
      code: "FRONTEND_NETWORK_ERROR",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("posts exact advancement path, method and body with encoded state ID", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(advancementResponse));
    const endpoints = new CropTwinEndpoints(new CropTwinApiClient({ baseUrl: "http://api", fetcher }));

    await endpoints.advanceOneDay("state 1/2", {
      advancement_id: "advancement-1",
      target_date: "2026-08-01",
      weather: {
        tmin_c: 20,
        tmax_c: 31,
        humidity_pct: 60,
        wind_speed_mps: 2,
        shortwave_radiation_sum_mj_m2: null,
        rainfall_mm: 0,
        eto_reference_feed: null,
      },
      last_irrigation_event: null,
    });

    expect(fetcher).toHaveBeenCalledWith(
      "http://api/sessions/state%201%2F2/advance-one-day",
      expect.objectContaining({
        cache: "no-store",
        method: "POST",
        body: JSON.stringify({
          state_id: "state 1/2",
          advancement_id: "advancement-1",
          target_date: "2026-08-01",
          weather: {
            tmin_c: 20,
            tmax_c: 31,
            humidity_pct: 60,
            wind_speed_mps: 2,
            shortwave_radiation_sum_mj_m2: null,
            rainfall_mm: 0,
            eto_reference_feed: null,
          },
          last_irrigation_event: null,
        }),
      }),
    );
  });

  it("parses advancement responses and rejects malformed nested JSON", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ ...advancementResponse, water_state: { ...advancementResponse.water_state, water_sequence: false } }),
    );
    const endpoints = new CropTwinEndpoints(new CropTwinApiClient({ baseUrl: "http://api", fetcher }));

    await expect(endpoints.advanceOneDay("state 1/2", {
      advancement_id: "advancement-1",
      target_date: "2026-08-01",
      weather: weatherRequest,
      last_irrigation_event: null,
    })).rejects.toMatchObject({
      code: "FRONTEND_MALFORMED_RESPONSE",
      kind: "malformed",
    });
  });

  it("supports caller abort for advancement requests", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const endpoints = new CropTwinEndpoints(new CropTwinApiClient({ baseUrl: "http://api", fetcher }));
    const request = endpoints.advanceOneDay("state 1/2", {
      advancement_id: "advancement-1",
      target_date: "2026-08-01",
      weather: weatherRequest,
      last_irrigation_event: null,
    }, { signal: controller.signal });

    controller.abort();

    await expect(request).rejects.toMatchObject({
      code: "FRONTEND_REQUEST_ABORTED",
      kind: "abort",
    });
  });

  it("forwards advancement timeout options", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn<typeof fetch>().mockImplementation(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          }),
      );
      const endpoints = new CropTwinEndpoints(new CropTwinApiClient({ baseUrl: "http://api", fetcher, timeoutMs: 30_000 }));
      const request = endpoints.advanceOneDay("state 1/2", {
        advancement_id: "advancement-1",
        target_date: "2026-08-01",
        weather: weatherRequest,
        last_irrigation_event: null,
      }, { timeoutMs: 5 });
      const assertion = expect(request).rejects.toMatchObject({
        code: "FRONTEND_REQUEST_TIMEOUT",
        kind: "timeout",
      });

      await vi.advanceTimersByTimeAsync(6);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not automatically retry failed advancement POST requests", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline"));
    const endpoints = new CropTwinEndpoints(new CropTwinApiClient({ baseUrl: "http://api", fetcher }));

    await expect(endpoints.advanceOneDay("state 1/2", {
      advancement_id: "advancement-1",
      target_date: "2026-08-01",
      weather: weatherRequest,
      last_irrigation_event: null,
    })).rejects.toMatchObject({
      code: "FRONTEND_NETWORK_ERROR",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
