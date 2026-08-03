import { describe, expect, it } from "vitest";
import type {
  RecommendationResponse,
  SimulateActionsResponse,
  UpdateTwinStateResponse,
} from "@/lib/types/api";
import {
  ACTION_ORDER,
  canonicalTwinDecisionSignature,
  normalizeRequestedActions,
  proveAcceptedSimulationSource,
  recommendationSourceSignature,
  simulationSourceSignature,
  validateRecommendationAgainstSimulation,
  validateSimulationForRequestedActions,
} from "./decision-utils";

const twin: UpdateTwinStateResponse = {
  state_id: "state-a",
  state_history_count: 1,
  snapshot_id: "snapshot-1",
  snapshot_created: true,
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
    computed_at: "2026-07-31T01:00:00Z",
    observation_time_basis: "DATE_ONLY_UTC_START",
    last_update_time: "2026-07-31T01:00:00Z",
  },
};

const simulation: SimulateActionsResponse = {
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
    {
      action: "NO_IRRIGATION_24H",
      projected_root_zone_depletion: 18,
      projected_raw_crossing: false,
      projected_stress_band: "medium",
      projected_water_use: 0,
      disease_wetness_risk_note: "note",
    },
  ],
};

const recommendation: RecommendationResponse = {
  state_id: "state-a",
  chosen_action: "NO_IRRIGATION_24H",
  irrigation_constraint: "NONE",
  inspection_advisory: false,
  decision_reason_codes: ["NO_IRRIGATION_SAFE_24H"],
  caution_reasons: [],
  evidence_summary_structured: {},
  recommended_at: "2026-07-31T02:10:00Z",
};

describe("decision utilities", () => {
  it("normalizes requested actions to canonical workflow order", () => {
    expect(normalizeRequestedActions([
      "NO_IRRIGATION_24H",
      "IRRIGATE_NOW",
      "IRRIGATE_TOMORROW_AM",
    ])).toEqual(["IRRIGATE_NOW", "IRRIGATE_TOMORROW_AM", "NO_IRRIGATION_24H"]);
    expect(normalizeRequestedActions([...ACTION_ORDER])).toEqual([...ACTION_ORDER]);
  });

  it("rejects empty or duplicate requested actions", () => {
    expect(() => normalizeRequestedActions([])).toThrow("Select at least one");
    expect(() => normalizeRequestedActions(["IRRIGATE_NOW", "IRRIGATE_NOW"])).toThrow("duplicates");
  });

  it("builds stable source signatures and changes when sources change", () => {
    expect(canonicalTwinDecisionSignature({ stateId: "state-a", twin })).toBe(
      canonicalTwinDecisionSignature({ stateId: "state-a", twin: { ...twin, current_state: { ...twin.current_state } } }),
    );
    expect(canonicalTwinDecisionSignature({ stateId: "state-a", twin })).not.toBe(
      canonicalTwinDecisionSignature({ stateId: "state-a", twin: { ...twin, snapshot_id: "snapshot-2" } }),
    );
    expect(simulationSourceSignature({ stateId: "state-a", twin, actions: ["IRRIGATE_NOW"] })).not.toBe(
      simulationSourceSignature({ stateId: "state-a", twin, actions: ["NO_IRRIGATION_24H"] }),
    );
    expect(recommendationSourceSignature({ stateId: "state-a", twin, simulation })).not.toBe(
      recommendationSourceSignature({ stateId: "state-a", twin, simulation: { ...simulation, simulated_at: "2026-07-31T03:00:00Z" } }),
    );
  });

  it("validates and normalizes simulations to submitted action order", () => {
    const response = {
      ...simulation,
      simulations: [...simulation.simulations].reverse(),
    };
    expect(validateSimulationForRequestedActions({
      response,
      requestedActions: ["NO_IRRIGATION_24H", "IRRIGATE_NOW"],
      expectedStateId: "state-a",
    }).simulations.map((result) => result.action)).toEqual(["IRRIGATE_NOW", "NO_IRRIGATION_24H"]);
  });

  it("rejects simulation action and state mismatches", () => {
    expect(() => validateSimulationForRequestedActions({
      response: { ...simulation, simulations: [simulation.simulations[0]] },
      requestedActions: ["IRRIGATE_NOW", "NO_IRRIGATION_24H"],
      expectedStateId: "state-a",
    })).toThrow("omitted");
    expect(() => validateSimulationForRequestedActions({
      response: simulation,
      requestedActions: ["IRRIGATE_NOW"],
      expectedStateId: "state-a",
    })).toThrow("unexpected");
    expect(() => validateSimulationForRequestedActions({
      response: { ...simulation, simulations: [simulation.simulations[0], simulation.simulations[0]] },
      requestedActions: ["IRRIGATE_NOW"],
      expectedStateId: "state-a",
    })).toThrow("duplicate");
    expect(() => validateSimulationForRequestedActions({
      response: { ...simulation, state_id: "state-b" },
      requestedActions: ["IRRIGATE_NOW"],
      expectedStateId: "state-a",
    })).toThrow("different session");
  });

  it("validates recommendation consistency with accepted simulation", () => {
    expect(validateRecommendationAgainstSimulation({
      recommendation,
      simulation,
      expectedStateId: "state-a",
    })).toBe(recommendation);
    expect(() => validateRecommendationAgainstSimulation({
      recommendation: { ...recommendation, chosen_action: "IRRIGATE_IN_6H" },
      simulation,
      expectedStateId: "state-a",
    })).toThrow("not in the accepted simulation");
    expect(() => validateRecommendationAgainstSimulation({
      recommendation,
      simulation: { ...simulation, simulations: [] },
      expectedStateId: "state-a",
    })).toThrow("at least one");
    expect(() => validateRecommendationAgainstSimulation({
      recommendation: { ...recommendation, state_id: "state-b" },
      simulation,
      expectedStateId: "state-a",
    })).toThrow("different session");
  });

  it("proves accepted simulation source for equivalent action sets and normalized backend order", () => {
    const acceptedSourceSignature = simulationSourceSignature({
      actions: ["NO_IRRIGATION_24H", "IRRIGATE_NOW"],
      stateId: "state-a",
      twin,
    });

    expect(proveAcceptedSimulationSource({
      acceptedActions: ["NO_IRRIGATION_24H", "IRRIGATE_NOW"],
      acceptedSourceSignature,
      simulation: { ...simulation, simulations: [...simulation.simulations].reverse() },
      stateId: "state-a",
      twin,
    })).toMatchObject({
      actions: ["IRRIGATE_NOW", "NO_IRRIGATION_24H"],
      sourceSignature: acceptedSourceSignature,
      simulation: {
        simulations: [
          { action: "IRRIGATE_NOW" },
          { action: "NO_IRRIGATION_24H" },
        ],
      },
    });
  });

  it("rejects inconsistent accepted simulation source metadata", () => {
    const acceptedSourceSignature = simulationSourceSignature({
      actions: ["IRRIGATE_NOW", "NO_IRRIGATION_24H"],
      stateId: "state-a",
      twin,
    });
    const proofInput = {
      acceptedActions: ["IRRIGATE_NOW", "NO_IRRIGATION_24H"],
      acceptedSourceSignature,
      simulation,
      stateId: "state-a",
      twin,
    } as const;

    expect(proveAcceptedSimulationSource({
      ...proofInput,
      acceptedActions: ["IRRIGATE_NOW"],
    })).toBeNull();
    expect(proveAcceptedSimulationSource({
      ...proofInput,
      acceptedSourceSignature: simulationSourceSignature({
        actions: ["IRRIGATE_NOW", "NO_IRRIGATION_24H"],
        stateId: "state-a",
        twin: { ...twin, snapshot_id: "snapshot-2" },
      }),
    })).toBeNull();
    expect(proveAcceptedSimulationSource({
      ...proofInput,
      simulation: { ...simulation, state_id: "state-b" },
    })).toBeNull();
    expect(proveAcceptedSimulationSource({
      ...proofInput,
      acceptedActions: ["IRRIGATE_NOW", "IRRIGATE_NOW"],
    })).toBeNull();
    expect(proveAcceptedSimulationSource({
      ...proofInput,
      simulation: { ...simulation, simulations: [simulation.simulations[0]] },
    })).toBeNull();
    expect(proveAcceptedSimulationSource({
      ...proofInput,
      simulation: {
        ...simulation,
        simulations: [
          ...simulation.simulations,
          {
            action: "IRRIGATE_IN_6H",
            projected_root_zone_depletion: 5,
            projected_raw_crossing: false,
            projected_stress_band: "low",
            projected_water_use: 10,
            disease_wetness_risk_note: "note",
          },
        ],
      },
    })).toBeNull();
    expect(proveAcceptedSimulationSource({
      ...proofInput,
      simulation: {
        ...simulation,
        simulations: [simulation.simulations[0], simulation.simulations[0]],
      },
    })).toBeNull();
  });
});
