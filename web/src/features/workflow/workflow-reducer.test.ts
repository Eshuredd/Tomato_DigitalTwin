import { describe, expect, it } from "vitest";
import { workflowReducer } from "./workflow-reducer";
import { initialWorkflowState, type WorkflowAction, type WorkflowState } from "./workflow-types";
import type {
  DiseasePredictionResponse,
  SessionResponse,
  SessionStateResponse,
  WaterStateResponse,
  WeatherInput,
  WeatherSnapshotResponse,
} from "@/lib/types/api";

const sessionA: SessionResponse = {
  state_id: "state-a",
  crop_type: "tomato",
  planting_date: "2026-07-01",
  location: { name: "Farm A", latitude: 17, longitude: 78, elevation_m: null },
  soil_texture: "sandy_loam",
  created_at: "2026-07-31T00:00:00Z",
};

const sessionB: SessionStateResponse = {
  ...sessionA,
  state_id: "state-b",
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

const diseaseA: DiseasePredictionResponse = {
  state_id: "state-a",
  crop_type: "tomato",
  predicted_label: "Tomato___Late_blight",
  disease_category: "fungal",
  class_probs: { Tomato___Late_blight: 0.91 },
  confidence_calibrated: 0.91,
  uncertainty_score: 0.09,
  uncertainty_band: "low",
  predicted_at: "2026-07-31T00:00:00Z",
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

const weatherSnapshot: WeatherSnapshotResponse = {
  ...weatherDraft,
  state_id: "state-a",
  target_date: "2026-07-31",
  source: "open_meteo",
  source_timezone: "UTC",
  latitude: 17,
  longitude: 78,
  wind_source_height_m: 10,
  wind_normalized_height_m: 2,
  shortwave_radiation_sum_mj_m2: 18,
  eto_reference_feed: 4.5,
  fetched_at: "2026-07-31T00:00:00Z",
};

const waterState: WaterStateResponse = {
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
  computed_at: "2026-07-31T00:00:00Z",
  observation_time_basis: "DATE_ONLY_UTC_START",
};

describe("workflowReducer", () => {
  it("makes created sessions active and clears prior disease", () => {
    const state = workflowReducer({ ...initialWorkflowState, disease: diseaseA }, {
      type: "sessionCreated",
      session: sessionA,
    });

    expect(state.activeStateId).toBe("state-a");
    expect(state.session).toBe(sessionA);
    expect(state.disease).toBeNull();
  });

  it("makes loaded sessions active", () => {
    const state = workflowReducer(initialWorkflowState, {
      type: "sessionLoaded",
      session: sessionB,
    });

    expect(state.activeStateId).toBe("state-b");
    expect(state.session).toBe(sessionB);
  });

  it("clears disease when loading a different state", () => {
    const previous: WorkflowState = {
      ...initialWorkflowState,
      activeStateId: "state-a",
      session: sessionA,
      disease: diseaseA,
    };

    expect(workflowReducer(previous, { type: "sessionLoaded", session: sessionB }).disease).toBeNull();
  });

  it("preserves disease when reloading the same state", () => {
    const previous: WorkflowState = {
      ...initialWorkflowState,
      activeStateId: "state-b",
      session: sessionB,
      disease: { ...diseaseA, state_id: "state-b" },
    };

    expect(workflowReducer(previous, { type: "sessionLoaded", session: sessionB }).disease).toBe(previous.disease);
  });

  it("stores disease only for the active state", () => {
    const previous = workflowReducer(initialWorkflowState, {
      type: "sessionCreated",
      session: sessionA,
    });

    expect(workflowReducer(previous, {
      type: "diseaseReceived",
      stateId: "state-a",
      disease: diseaseA,
    }).disease).toBe(diseaseA);
    expect(workflowReducer(previous, {
      type: "diseaseReceived",
      stateId: "state-b",
      disease: { ...diseaseA, state_id: "state-b" },
    }).disease).toBeNull();
  });

  it("clearing the session resets workflow state", () => {
    expect(workflowReducer({
      ...initialWorkflowState,
      activeStateId: "state-a",
      session: sessionA,
      disease: diseaseA,
    }, { type: "sessionCleared" })).toEqual(initialWorkflowState);
  });

  it("does not mutate the previous state", () => {
    const previous = Object.freeze({
      ...initialWorkflowState,
      activeStateId: "state-a",
      session: sessionA,
      disease: diseaseA,
    });

    workflowReducer(previous, { type: "sessionLoaded", session: sessionB });

    expect(previous.activeStateId).toBe("state-a");
    expect(previous.disease).toBe(diseaseA);
  });

  it("returns the previous state for impossible runtime actions", () => {
    const invalidAction = { type: "unknown" } as unknown as WorkflowAction;

    expect(workflowReducer(initialWorkflowState, invalidAction)).toBe(initialWorkflowState);
  });

  it("stores weather snapshot and draft only for the active state", () => {
    const active = workflowReducer(initialWorkflowState, {
      type: "sessionCreated",
      session: sessionA,
    });
    const next = workflowReducer(active, {
      type: "weatherSnapshotReceived",
      stateId: "state-a",
      snapshot: weatherSnapshot,
      draft: weatherDraft,
    });
    expect(next.weatherSnapshot).toBe(weatherSnapshot);
    expect(next.weatherDraft).toBe(weatherDraft);
    expect(next.weatherDate).toBe("2026-07-31");
    expect(workflowReducer(active, {
      type: "weatherSnapshotReceived",
      stateId: "state-b",
      snapshot: { ...weatherSnapshot, state_id: "state-b" },
      draft: weatherDraft,
    })).toBe(active);
  });

  it("invalidates water when weather draft changes", () => {
    const previous: WorkflowState = {
      ...initialWorkflowState,
      activeStateId: "state-a",
      session: sessionA,
      weatherDraft,
      water: waterState,
      latestWaterObservationId: "water-observation-1",
      latestWaterSequence: 1,
    };

    const next = workflowReducer(previous, {
      type: "weatherDraftChanged",
      stateId: "state-a",
      draft: { ...weatherDraft, rainfall_mm: 1 },
    });

    expect(next.water).toBeNull();
    expect(next.latestWaterObservationId).toBe("water-observation-1");
    expect(next.latestWaterSequence).toBe(1);
  });

  it("ignores stale weather draft changes", () => {
    const previous: WorkflowState = {
      ...initialWorkflowState,
      activeStateId: "state-a",
      session: sessionA,
      weatherDraft,
    };

    expect(workflowReducer(previous, {
      type: "weatherDraftChanged",
      stateId: "state-b",
      draft: { ...weatherDraft, rainfall_mm: 1 },
    })).toBe(previous);
  });

  it("invalid weather clears the draft and displayed water but preserves lineage", () => {
    const previous: WorkflowState = {
      ...initialWorkflowState,
      activeStateId: "state-a",
      session: sessionA,
      weatherSnapshot,
      weatherDraft,
      water: waterState,
      latestWaterObservationId: "water-observation-1",
      latestWaterSequence: 1,
    };

    const next = workflowReducer(previous, {
      type: "weatherDraftInvalidated",
      stateId: "state-a",
    });

    expect(next.weatherSnapshot).toBe(weatherSnapshot);
    expect(next.weatherDraft).toBeNull();
    expect(next.water).toBeNull();
    expect(next.latestWaterObservationId).toBe("water-observation-1");
    expect(next.latestWaterSequence).toBe(1);
  });

  it("ignores stale weather invalidation", () => {
    const previous: WorkflowState = {
      ...initialWorkflowState,
      activeStateId: "state-a",
      session: sessionA,
      weatherDraft,
    };

    expect(workflowReducer(previous, {
      type: "weatherDraftInvalidated",
      stateId: "state-b",
    })).toBe(previous);
  });

  it("tracks and clears matching water computation requests", () => {
    const active = workflowReducer(initialWorkflowState, {
      type: "sessionCreated",
      session: sessionA,
    });
    const pending = workflowReducer(active, {
      type: "waterComputationStarted",
      stateId: "state-a",
      requestId: "request-1",
      signature: "signature-1",
    });

    expect(pending.waterComputationPending).toBe(true);
    expect(pending.activeWaterRequestId).toBe("request-1");
    expect(pending.activeWaterRequestSignature).toBe("signature-1");
    expect(workflowReducer(pending, {
      type: "waterComputationFinished",
      stateId: "state-a",
      requestId: "request-older",
    })).toBe(pending);

    const finished = workflowReducer(pending, {
      type: "waterComputationFinished",
      stateId: "state-a",
      requestId: "request-1",
    });
    expect(finished.waterComputationPending).toBe(false);
    expect(finished.activeWaterRequestId).toBeNull();
    expect(finished.activeWaterRequestSignature).toBeNull();
  });

  it("updates latest water lineage from active water responses", () => {
    const active = workflowReducer(initialWorkflowState, {
      type: "sessionCreated",
      session: sessionA,
    });
    const next = workflowReducer(active, {
      type: "waterReceived",
      stateId: "state-a",
      water: waterState,
    });
    expect(next.water).toBe(waterState);
    expect(next.waterComputationPending).toBe(false);
    expect(next.latestWaterObservationId).toBe("water-observation-1");
    expect(next.latestWaterSequence).toBe(1);
    expect(workflowReducer(active, {
      type: "waterReceived",
      stateId: "state-b",
      water: { ...waterState, state_id: "state-b" },
    })).toBe(active);
  });

  it("clears session-scoped disease, weather and water when loading another state", () => {
    const previous: WorkflowState = {
      ...initialWorkflowState,
      activeStateId: "state-a",
      session: sessionA,
      disease: diseaseA,
      weatherSnapshot,
      weatherDraft,
      weatherDate: weatherSnapshot.target_date,
      water: waterState,
      waterComputationPending: true,
      activeWaterRequestId: "request-1",
      activeWaterRequestSignature: "signature-1",
      latestWaterObservationId: "water-observation-1",
      latestWaterSequence: 1,
    };

    const next = workflowReducer(previous, { type: "sessionLoaded", session: sessionB });

    expect(next.disease).toBeNull();
    expect(next.weatherSnapshot).toBeNull();
    expect(next.weatherDraft).toBeNull();
    expect(next.weatherDate).toBeNull();
    expect(next.water).toBeNull();
    expect(next.waterComputationPending).toBe(false);
    expect(next.activeWaterRequestId).toBeNull();
    expect(next.activeWaterRequestSignature).toBeNull();
    expect(next.latestWaterObservationId).toBeNull();
    expect(next.latestWaterSequence).toBe(0);
  });
});
