import { describe, expect, it } from "vitest";
import { workflowReducer } from "./workflow-reducer";
import { initialWorkflowState, type WorkflowAction, type WorkflowState } from "./workflow-types";
import type {
  AdvanceOneDayResponse,
  DiseasePredictionResponse,
  RecommendationResponse,
  SessionResponse,
  SessionStateResponse,
  SimulateActionsResponse,
  UpdateTwinStateResponse,
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

const twinState: UpdateTwinStateResponse = {
  state_id: "state-a",
  current_state: {
    crop_type: "tomato",
    growth_stage: "development",
    days_since_planting: 30,
    predicted_label: "Tomato___Late_blight",
    disease_category: "fungal",
    confidence_calibrated: 0.91,
    uncertainty_score: 0.09,
    uncertainty_band: "low",
    eto_computed: 4,
    eto_method: "penman_monteith",
    kc: 0.8,
    etc: 3.2,
    taw: 48,
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
    last_update_time: "2026-07-31T01:00:00Z",
  },
  state_history_count: 1,
  snapshot_id: "snapshot-1",
  snapshot_created: true,
};

const advancementState: AdvanceOneDayResponse = {
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
    ...twinState,
    snapshot_id: "snapshot-2",
    current_state: {
      ...twinState.current_state,
      observed_at: "2026-08-01T00:00:00Z",
      last_update_time: "2026-08-01T01:00:00Z",
    },
  },
};

const simulationState: SimulateActionsResponse = {
  state_id: "state-a",
  simulated_at: "2026-07-31T02:00:00Z",
  simulations: [
    {
      action: "IRRIGATE_NOW",
      projected_root_zone_depletion: 3.2,
      projected_raw_crossing: false,
      projected_stress_band: "low",
      projected_water_use: 10,
      disease_wetness_risk_note: "note",
    },
  ],
};

const recommendationState: RecommendationResponse = {
  state_id: "state-a",
  chosen_action: "IRRIGATE_NOW",
  irrigation_constraint: "NONE",
  inspection_advisory: false,
  decision_reason_codes: ["CURRENT_DEPLETION_EXCEEDS_RAW"],
  caution_reasons: [],
  evidence_summary_structured: {},
  recommended_at: "2026-07-31T02:10:00Z",
};

describe("workflowReducer", () => {
  it("starts with no twin state", () => {
    expect(initialWorkflowState.twin).toBeNull();
    expect(initialWorkflowState.twinUpdatePending).toBe(false);
    expect(initialWorkflowState.activeTwinRequestId).toBeNull();
    expect(initialWorkflowState.activeTwinSourceSignature).toBeNull();
    expect(initialWorkflowState.advancementPending).toBe(false);
    expect(initialWorkflowState.latestAdvancement).toBeNull();
    expect(initialWorkflowState.retainedAdvancement).toBeNull();
    expect(initialWorkflowState.simulation).toBeNull();
    expect(initialWorkflowState.simulationPending).toBe(false);
    expect(initialWorkflowState.recommendation).toBeNull();
    expect(initialWorkflowState.recommendationPending).toBe(false);
  });

  it("uses request IDs so old disease requests cannot clear newer pending state", () => {
    const active = workflowReducer(initialWorkflowState, {
      type: "sessionCreated",
      session: sessionA,
    });
    const first = workflowReducer(active, {
      type: "diseaseRequestStarted",
      stateId: "state-a",
      requestId: "disease-1",
    });
    const second = workflowReducer(first, {
      type: "diseaseRequestStarted",
      stateId: "state-a",
      requestId: "disease-2",
    });

    expect(workflowReducer(second, {
      type: "diseaseRequestFinished",
      stateId: "state-a",
      requestId: "disease-1",
    })).toBe(second);

    const finished = workflowReducer(second, {
      type: "diseaseRequestFinished",
      stateId: "state-a",
      requestId: "disease-2",
    });
    expect(finished.diseaseRequestPending).toBe(false);
    expect(finished.activeDiseaseRequestId).toBeNull();
  });

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
    expect(state.loadedCurrentState).toBe(sessionB.current_state);
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
      twin: twinState,
    };

    const next = workflowReducer(previous, {
      type: "weatherDraftChanged",
      stateId: "state-a",
      draft: { ...weatherDraft, rainfall_mm: 1 },
    });

    expect(next.water).toBeNull();
    expect(next.latestWaterObservationId).toBe("water-observation-1");
    expect(next.latestWaterSequence).toBe(1);
    expect(next.twin).toBe(twinState);
  });

  it("stores weather snapshots while preserving canonical lineage and twin", () => {
    const previous: WorkflowState = {
      ...initialWorkflowState,
      activeStateId: "state-a",
      session: sessionA,
      weatherDraft,
      water: waterState,
      latestWaterObservationId: "water-observation-1",
      latestWaterSequence: 1,
      twin: twinState,
    };

    const next = workflowReducer(previous, {
      type: "weatherSnapshotReceived",
      stateId: "state-a",
      snapshot: { ...weatherSnapshot, target_date: "2026-08-01" },
      draft: { ...weatherDraft, rainfall_mm: 2 },
    });

    expect(next.water).toBeNull();
    expect(next.latestWaterObservationId).toBe("water-observation-1");
    expect(next.latestWaterSequence).toBe(1);
    expect(next.twin).toBe(twinState);
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
      twin: twinState,
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
    expect(next.twin).toBe(twinState);
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

  it("starts twin update only for the active state", () => {
    const active = workflowReducer(initialWorkflowState, {
      type: "sessionCreated",
      session: sessionA,
    });

    expect(workflowReducer(active, {
      type: "twinUpdateStarted",
      stateId: "state-b",
      requestId: "twin-1",
      sourceSignature: "source-1",
    })).toBe(active);

    const pending = workflowReducer(active, {
      type: "twinUpdateStarted",
      stateId: "state-a",
      requestId: "twin-1",
      sourceSignature: "source-1",
    });
    expect(pending.twinUpdatePending).toBe(true);
    expect(pending.activeTwinRequestId).toBe("twin-1");
    expect(pending.activeTwinSourceSignature).toBe("source-1");
  });

  it("clears matching twin update finishes and ignores non-matching finishes", () => {
    const pending: WorkflowState = {
      ...initialWorkflowState,
      activeStateId: "state-a",
      session: sessionA,
      twinUpdatePending: true,
      activeTwinRequestId: "twin-1",
      activeTwinSourceSignature: "source-1",
    };

    expect(workflowReducer(pending, {
      type: "twinUpdateFinished",
      stateId: "state-a",
      requestId: "twin-older",
    })).toBe(pending);

    const finished = workflowReducer(pending, {
      type: "twinUpdateFinished",
      stateId: "state-a",
      requestId: "twin-1",
    });
    expect(finished.twinUpdatePending).toBe(false);
    expect(finished.activeTwinRequestId).toBeNull();
    expect(finished.activeTwinSourceSignature).toBeNull();
  });

  it("stores active twin responses and ignores responses for another state", () => {
    const active = workflowReducer(initialWorkflowState, {
      type: "sessionCreated",
      session: sessionA,
    });

    const next = workflowReducer(active, {
      type: "twinReceived",
      stateId: "state-a",
      twin: twinState,
    });
    expect(next.twin).toBe(twinState);
    expect(next.twinUpdatePending).toBe(false);

    expect(workflowReducer(active, {
      type: "twinReceived",
      stateId: "state-b",
      twin: { ...twinState, state_id: "state-b" },
    })).toBe(active);
  });

  it("stores reused snapshots normally", () => {
    const active = workflowReducer(initialWorkflowState, {
      type: "sessionCreated",
      session: sessionA,
    });
    const reused = { ...twinState, snapshot_created: false };

    expect(workflowReducer(active, {
      type: "twinReceived",
      stateId: "state-a",
      twin: reused,
    }).twin).toBe(reused);
  });

  it("accepted disease clears an existing twin", () => {
    const previous: WorkflowState = {
      ...initialWorkflowState,
      activeStateId: "state-a",
      session: sessionA,
      twin: twinState,
      twinUpdatePending: true,
      activeTwinRequestId: "twin-1",
      activeTwinSourceSignature: "source-1",
    };

    const next = workflowReducer(previous, {
      type: "diseaseReceived",
      stateId: "state-a",
      disease: diseaseA,
    });

    expect(next.disease).toBe(diseaseA);
    expect(next.twin).toBeNull();
    expect(next.twinUpdatePending).toBe(false);
    expect(next.activeTwinRequestId).toBeNull();
    expect(next.activeTwinSourceSignature).toBeNull();
  });

  it("accepted water clears an existing twin but preserves canonical water lineage", () => {
    const previous: WorkflowState = {
      ...initialWorkflowState,
      activeStateId: "state-a",
      session: sessionA,
      twin: twinState,
      twinUpdatePending: true,
      activeTwinRequestId: "twin-1",
      activeTwinSourceSignature: "source-1",
      latestWaterObservationId: "water-observation-older",
      latestWaterSequence: 1,
    };

    const next = workflowReducer(previous, {
      type: "waterReceived",
      stateId: "state-a",
      water: { ...waterState, water_sequence: 2 },
    });

    expect(next.twin).toBeNull();
    expect(next.twinUpdatePending).toBe(false);
    expect(next.activeTwinRequestId).toBeNull();
    expect(next.activeTwinSourceSignature).toBeNull();
    expect(next.latestWaterObservationId).toBe("water-observation-1");
    expect(next.latestWaterSequence).toBe(2);
  });

  it("weather draft changes do not clear an existing canonical twin", () => {
    const previous: WorkflowState = {
      ...initialWorkflowState,
      activeStateId: "state-a",
      session: sessionA,
      weatherDraft,
      water: waterState,
      twin: twinState,
    };

    const next = workflowReducer(previous, {
      type: "weatherDraftChanged",
      stateId: "state-a",
      draft: { ...weatherDraft, rainfall_mm: 1 },
    });

    expect(next.water).toBeNull();
    expect(next.twin).toBe(twinState);
  });

  it("clears session-scoped disease, weather and water when loading another state", () => {
    const previous: WorkflowState = {
      ...initialWorkflowState,
      activeStateId: "state-a",
      session: sessionA,
      disease: diseaseA,
      diseaseRequestPending: true,
      weatherSnapshot,
      weatherDraft,
      weatherDate: weatherSnapshot.target_date,
      water: waterState,
      waterComputationPending: true,
      activeWaterRequestId: "request-1",
      activeWaterRequestSignature: "signature-1",
      twin: twinState,
      twinUpdatePending: true,
      activeTwinRequestId: "twin-1",
      activeTwinSourceSignature: "source-1",
      latestWaterObservationId: "water-observation-1",
      latestWaterSequence: 1,
    };

    const next = workflowReducer(previous, { type: "sessionLoaded", session: sessionB });

    expect(next.disease).toBeNull();
    expect(next.diseaseRequestPending).toBe(false);
    expect(next.weatherSnapshot).toBeNull();
    expect(next.weatherDraft).toBeNull();
    expect(next.weatherDate).toBeNull();
    expect(next.water).toBeNull();
    expect(next.waterComputationPending).toBe(false);
    expect(next.activeWaterRequestId).toBeNull();
    expect(next.activeWaterRequestSignature).toBeNull();
    expect(next.twin).toBeNull();
    expect(next.twinUpdatePending).toBe(false);
    expect(next.activeTwinRequestId).toBeNull();
    expect(next.activeTwinSourceSignature).toBeNull();
    expect(next.latestWaterObservationId).toBeNull();
    expect(next.latestWaterSequence).toBe(0);
  });

  it("session clear clears twin state and pending metadata", () => {
    const previous: WorkflowState = {
      ...initialWorkflowState,
      activeStateId: "state-a",
      session: sessionA,
      twin: twinState,
      twinUpdatePending: true,
      activeTwinRequestId: "twin-1",
      activeTwinSourceSignature: "source-1",
    };

    expect(workflowReducer(previous, { type: "sessionCleared" })).toEqual(initialWorkflowState);
  });

  it("twin actions do not change canonical water lineage", () => {
    const previous: WorkflowState = {
      ...initialWorkflowState,
      activeStateId: "state-a",
      session: sessionA,
      latestWaterObservationId: "water-observation-1",
      latestWaterSequence: 1,
    };

    const next = workflowReducer(previous, {
      type: "twinReceived",
      stateId: "state-a",
      twin: twinState,
    });

    expect(next.latestWaterObservationId).toBe("water-observation-1");
    expect(next.latestWaterSequence).toBe(1);
  });

  it("tracks matching advancement requests", () => {
    const active = workflowReducer(initialWorkflowState, {
      type: "sessionCreated",
      session: sessionA,
    });
    const pending = workflowReducer(active, {
      type: "advancementStarted",
      stateId: "state-a",
      requestId: "advancement-1",
      signature: "signature-1",
    });

    expect(pending.advancementPending).toBe(true);
    expect(pending.activeAdvancementRequestId).toBe("advancement-1");
    expect(workflowReducer(pending, {
      type: "advancementFinished",
      stateId: "state-a",
      requestId: "advancement-old",
    })).toBe(pending);

    const finished = workflowReducer(pending, {
      type: "advancementFinished",
      stateId: "state-a",
      requestId: "advancement-1",
    });
    expect(finished.advancementPending).toBe(false);
    expect(finished.activeAdvancementRequestId).toBeNull();
  });

  it("applies new advancement to canonical water and twin", () => {
    const pending: WorkflowState = {
      ...initialWorkflowState,
      activeStateId: "state-a",
      session: sessionA,
      water: waterState,
      twin: twinState,
      latestWaterObservationId: "water-observation-1",
      latestWaterSequence: 1,
      advancementPending: true,
      activeAdvancementRequestId: "advancement-1",
      activeAdvancementRequestSignature: "signature-1",
    };

    const next = workflowReducer(pending, {
      type: "advancementApplied",
      stateId: "state-a",
      requestId: "advancement-1",
      response: advancementState,
      canonicalWater: advancementState.water_state,
      canonicalTwin: advancementState.twin_state,
      retainedResponse: null,
      notice: null,
      transitionKind: "new_advancement",
      twinRefreshStatus: "not_needed",
    });

    expect(next.water).toBe(advancementState.water_state);
    expect(next.twin).toBe(advancementState.twin_state);
    expect(next.latestWaterObservationId).toBe("water-observation-2");
    expect(next.latestWaterSequence).toBe(2);
    expect(next.latestAdvancement).toBe(advancementState);
    expect(next.retainedAdvancement).toBeNull();
  });

  it("retains historical advancement responses without replacing canonical state", () => {
    const pending: WorkflowState = {
      ...initialWorkflowState,
      activeStateId: "state-a",
      session: sessionA,
      water: waterState,
      twin: twinState,
      latestWaterObservationId: "water-observation-3",
      latestWaterSequence: 3,
      advancementPending: true,
      activeAdvancementRequestId: "advancement-1",
      activeAdvancementRequestSignature: "signature-1",
    };

    const next = workflowReducer(pending, {
      type: "advancementApplied",
      stateId: "state-a",
      requestId: "advancement-1",
      response: advancementState,
      retainedResponse: advancementState,
      notice: "reused",
      transitionKind: "historical_retry",
      twinRefreshStatus: "not_needed",
    });

    expect(next.water).toBe(waterState);
    expect(next.twin).toBe(twinState);
    expect(next.latestWaterObservationId).toBe("water-observation-3");
    expect(next.latestWaterSequence).toBe(3);
    expect(next.retainedAdvancement).toBe(advancementState);
    expect(next.advancementNotice).toBe("reused");
  });

  it("tracks matching simulation requests and ignores stale finishes", () => {
    const active = workflowReducer(initialWorkflowState, {
      type: "sessionCreated",
      session: sessionA,
    });
    const pending = workflowReducer(active, {
      type: "simulationStarted",
      stateId: "state-a",
      requestId: "simulation-1",
      sourceSignature: "source-1",
    });

    expect(pending.simulationPending).toBe(true);
    expect(workflowReducer(pending, {
      type: "simulationStarted",
      stateId: "state-b",
      requestId: "simulation-b",
      sourceSignature: "source-b",
    })).toBe(pending);
    expect(workflowReducer(pending, {
      type: "simulationFinished",
      stateId: "state-a",
      requestId: "older",
    })).toBe(pending);
    expect(workflowReducer(pending, {
      type: "simulationFinished",
      stateId: "state-a",
      requestId: "simulation-1",
    }).simulationPending).toBe(false);
  });

  it("stores simulation and clears a previous recommendation", () => {
    const pending: WorkflowState = {
      ...initialWorkflowState,
      activeStateId: "state-a",
      session: sessionA,
      recommendation: recommendationState,
      recommendationPending: true,
      activeRecommendationRequestId: "recommendation-1",
      activeRecommendationSourceSignature: "recommendation-source",
      simulationPending: true,
      activeSimulationRequestId: "simulation-1",
      activeSimulationSourceSignature: "simulation-source",
    };

    const next = workflowReducer(pending, {
      type: "simulationReceived",
      stateId: "state-a",
      requestId: "simulation-1",
      simulation: simulationState,
    });

    expect(next.simulation).toBe(simulationState);
    expect(next.simulationPending).toBe(false);
    expect(next.recommendation).toBeNull();
    expect(next.recommendationPending).toBe(false);
    expect(workflowReducer(pending, {
      type: "simulationReceived",
      stateId: "state-a",
      requestId: "older",
      simulation: simulationState,
    })).toBe(pending);
    expect(workflowReducer(pending, {
      type: "simulationReceived",
      stateId: "state-b",
      requestId: "simulation-1",
      simulation: { ...simulationState, state_id: "state-b" },
    })).toBe(pending);
  });

  it("invalidates simulation and recommendation together", () => {
    const previous: WorkflowState = {
      ...initialWorkflowState,
      activeStateId: "state-a",
      session: sessionA,
      simulation: simulationState,
      recommendation: recommendationState,
    };

    const next = workflowReducer(previous, {
      type: "simulationInvalidated",
      stateId: "state-a",
    });

    expect(next.simulation).toBeNull();
    expect(next.recommendation).toBeNull();
  });

  it("tracks and stores recommendation without clearing simulation", () => {
    const pending: WorkflowState = {
      ...initialWorkflowState,
      activeStateId: "state-a",
      session: sessionA,
      simulation: simulationState,
      recommendationPending: true,
      activeRecommendationRequestId: "recommendation-1",
      activeRecommendationSourceSignature: "source-1",
    };

    expect(workflowReducer(pending, {
      type: "recommendationStarted",
      stateId: "state-b",
      requestId: "recommendation-b",
      sourceSignature: "source-b",
    })).toBe(pending);
    expect(workflowReducer(pending, {
      type: "recommendationFinished",
      stateId: "state-a",
      requestId: "older",
    })).toBe(pending);

    const next = workflowReducer(pending, {
      type: "recommendationReceived",
      stateId: "state-a",
      requestId: "recommendation-1",
      recommendation: recommendationState,
    });

    expect(next.recommendation).toBe(recommendationState);
    expect(next.simulation).toBe(simulationState);
    expect(next.recommendationPending).toBe(false);
    expect(workflowReducer(pending, {
      type: "recommendationReceived",
      stateId: "state-b",
      requestId: "recommendation-1",
      recommendation: { ...recommendationState, state_id: "state-b" },
    })).toBe(pending);
  });

  it("recommendation invalidation preserves accepted simulation", () => {
    const previous: WorkflowState = {
      ...initialWorkflowState,
      activeStateId: "state-a",
      session: sessionA,
      simulation: simulationState,
      recommendation: recommendationState,
    };

    const next = workflowReducer(previous, {
      type: "recommendationInvalidated",
      stateId: "state-a",
    });

    expect(next.simulation).toBe(simulationState);
    expect(next.recommendation).toBeNull();
  });

  it("canonical disease, water, twin and session changes clear decision state", () => {
    const previous: WorkflowState = {
      ...initialWorkflowState,
      activeStateId: "state-a",
      session: sessionA,
      twin: twinState,
      simulation: simulationState,
      recommendation: recommendationState,
    };

    expect(workflowReducer(previous, {
      type: "diseaseReceived",
      stateId: "state-a",
      disease: diseaseA,
    }).simulation).toBeNull();
    expect(workflowReducer(previous, {
      type: "waterReceived",
      stateId: "state-a",
      water: waterState,
    }).recommendation).toBeNull();
    expect(workflowReducer(previous, {
      type: "twinInvalidated",
      stateId: "state-a",
    }).simulation).toBeNull();
    expect(workflowReducer(previous, {
      type: "sessionLoaded",
      session: sessionB,
    }).recommendation).toBeNull();
  });

  it("unsubmitted weather draft edits preserve decision state when canonical twin is unchanged", () => {
    const previous: WorkflowState = {
      ...initialWorkflowState,
      activeStateId: "state-a",
      session: sessionA,
      weatherDraft,
      simulation: simulationState,
      recommendation: recommendationState,
    };

    const next = workflowReducer(previous, {
      type: "weatherDraftChanged",
      stateId: "state-a",
      draft: { ...weatherDraft, rainfall_mm: 1 },
    });

    expect(next.simulation).toBe(simulationState);
    expect(next.recommendation).toBe(recommendationState);
  });
});
