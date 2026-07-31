import { describe, expect, it } from "vitest";
import { workflowReducer } from "./workflow-reducer";
import { initialWorkflowState, type WorkflowAction, type WorkflowState } from "./workflow-types";
import type { DiseasePredictionResponse, SessionResponse, SessionStateResponse } from "@/lib/types/api";

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
      activeStateId: "state-a",
      session: sessionA,
      disease: diseaseA,
    };

    expect(workflowReducer(previous, { type: "sessionLoaded", session: sessionB }).disease).toBeNull();
  });

  it("preserves disease when reloading the same state", () => {
    const previous: WorkflowState = {
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
      activeStateId: "state-a",
      session: sessionA,
      disease: diseaseA,
    }, { type: "sessionCleared" })).toEqual(initialWorkflowState);
  });

  it("does not mutate the previous state", () => {
    const previous = Object.freeze({
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
});
