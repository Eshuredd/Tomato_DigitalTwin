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
});
