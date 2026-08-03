import { render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WorkflowProvider } from "@/features/workflow/workflow-context";
import { initialWorkflowState } from "@/features/workflow/workflow-types";
import { CropTwinApiError } from "@/lib/api/errors";
import type { RecommendationResponse, SimulateActionsResponse, UpdateTwinStateResponse } from "@/lib/types/api";
import { SimulationPanel, type SimulationPanelEndpoints } from "./simulation-panel";
import {
  ACTION_ORDER,
  recommendationSourceSignature,
  simulationSourceSignature,
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
      action: "NO_IRRIGATION_24H",
      projected_root_zone_depletion: 18,
      projected_raw_crossing: false,
      projected_stress_band: "medium",
      projected_water_use: 0,
      disease_wetness_risk_note: "no_irrigation_wetness_added",
    },
    {
      action: "IRRIGATE_NOW",
      projected_root_zone_depletion: 3.2,
      projected_raw_crossing: true,
      projected_stress_band: "low",
      projected_water_use: 10,
      disease_wetness_risk_note: "no_fungal_wetness_risk_flagged",
    },
  ],
};

const allActionsSimulation: SimulateActionsResponse = {
  ...simulation,
  simulations: ACTION_ORDER.map((action, index) => ({
    action,
    projected_root_zone_depletion: 10 + index,
    projected_raw_crossing: false,
    projected_stress_band: "low",
    projected_water_use: action === "NO_IRRIGATION_24H" ? 0 : 10,
    disease_wetness_risk_note: "note",
  })),
};

const recommendation: RecommendationResponse = {
  state_id: "state-a",
  chosen_action: "IRRIGATE_NOW",
  irrigation_constraint: "NONE",
  inspection_advisory: false,
  decision_reason_codes: ["CURRENT_DEPLETION_EXCEEDS_RAW"],
  caution_reasons: [],
  evidence_summary_structured: {},
  recommended_at: "2026-07-31T02:10:00Z",
};

const allActionsSimulationSourceSignature = simulationSourceSignature({
  actions: [...ACTION_ORDER],
  stateId: "state-a",
  twin,
});

const allActionsRecommendationSourceSignature = recommendationSourceSignature({
  simulation: allActionsSimulation,
  stateId: "state-a",
  twin,
});

function endpoints(response: SimulateActionsResponse = simulation): SimulationPanelEndpoints {
  return {
    simulateActions: vi.fn().mockResolvedValue(response),
  };
}

function renderPanel(api = endpoints(), overrides = {}) {
  return {
    api,
    ...render(
      <WorkflowProvider
        initialState={{
          ...initialWorkflowState,
          activeStateId: "state-a",
          session: {
            state_id: "state-a",
            crop_type: "tomato",
            planting_date: "2026-07-01",
            location: { name: "Farm", latitude: 17, longitude: 78 },
            soil_texture: "sandy_loam",
            created_at: "2026-07-31T00:00:00Z",
          },
          twin,
          ...overrides,
        }}
      >
        <SimulationPanel endpoints={api} />
      </WorkflowProvider>,
    ),
  };
}

describe("SimulationPanel", () => {
  it("selects all four actions by default and submits explicit selections only", async () => {
    const user = userEvent.setup();
    const { api } = renderPanel();

    expect(screen.getByLabelText(/Irrigate now/)).toBeChecked();
    expect(screen.getByLabelText(/Irrigate in 6 hours/)).toBeChecked();
    expect(screen.getByLabelText(/Irrigate tomorrow morning/)).toBeChecked();
    expect(screen.getByLabelText(/No irrigation for 24 hours/)).toBeChecked();

    await user.click(screen.getByLabelText(/Irrigate in 6 hours/));
    await user.click(screen.getByLabelText(/Irrigate tomorrow morning/));
    await user.click(screen.getByRole("button", { name: "Simulate selected actions" }));

    await waitFor(() => expect(api.simulateActions).toHaveBeenCalledWith(
      "state-a",
      { actions: ["IRRIGATE_NOW", "NO_IRRIGATION_24H"] },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ));
    expect(screen.getByRole("heading", { name: "Irrigate now" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No irrigation for 24 hours" })).toBeInTheDocument();
    expect(screen.getAllByText("IRRIGATE_NOW").length).toBeGreaterThan(0);
    expect(screen.queryByText(/best action/i)).not.toBeInTheDocument();
  });

  it("invalidates accepted decisions when the selected action set changes and resubmits only the new set", async () => {
    const user = userEvent.setup();
    const nextSimulation = {
      ...allActionsSimulation,
      simulations: allActionsSimulation.simulations.filter((result) => result.action !== "IRRIGATE_IN_6H"),
    };
    const { api } = renderPanel(endpoints(nextSimulation), {
      simulation: allActionsSimulation,
      acceptedSimulationSourceSignature: allActionsSimulationSourceSignature,
      acceptedSimulationActions: [...ACTION_ORDER],
      recommendation,
      acceptedRecommendationSourceSignature: allActionsRecommendationSourceSignature,
    });

    expect(screen.getByRole("heading", { name: "Irrigate in 6 hours" })).toBeInTheDocument();
    await user.click(screen.getByLabelText(/Irrigate in 6 hours/));

    expect(screen.getByRole("heading", { name: "No candidate projections yet" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Irrigate in 6 hours" })).not.toBeInTheDocument();
    expect(api.simulateActions).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Simulate selected actions" }));
    await waitFor(() => expect(api.simulateActions).toHaveBeenCalledWith(
      "state-a",
      { actions: ["IRRIGATE_NOW", "IRRIGATE_TOMORROW_AM", "NO_IRRIGATION_24H"] },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ));
  });

  it("preserves accepted decisions when remounted with the same canonical source", async () => {
    const user = userEvent.setup();
    const api = endpoints();

    function Harness() {
      const [visible, setVisible] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setVisible((current) => !current)}>
            Toggle panel
          </button>
          {visible ? <SimulationPanel endpoints={api} /> : null}
        </>
      );
    }

    render(
      <WorkflowProvider
        initialState={{
          ...initialWorkflowState,
          activeStateId: "state-a",
          session: {
            state_id: "state-a",
            crop_type: "tomato",
            planting_date: "2026-07-01",
            location: { name: "Farm", latitude: 17, longitude: 78 },
            soil_texture: "sandy_loam",
            created_at: "2026-07-31T00:00:00Z",
          },
          twin,
          simulation: allActionsSimulation,
          acceptedSimulationSourceSignature: allActionsSimulationSourceSignature,
          acceptedSimulationActions: [...ACTION_ORDER],
          recommendation,
          acceptedRecommendationSourceSignature: allActionsRecommendationSourceSignature,
        }}
      >
        <Harness />
      </WorkflowProvider>,
    );

    expect(screen.getByRole("heading", { name: "Irrigate in 6 hours" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Toggle panel" }));
    await user.click(screen.getByRole("button", { name: "Toggle panel" }));

    expect(screen.getByRole("heading", { name: "Irrigate in 6 hours" })).toBeInTheDocument();
    expect(api.simulateActions).not.toHaveBeenCalled();
  });

  it("requires at least one selected action", async () => {
    const user = userEvent.setup();
    const { api } = renderPanel();

    for (const label of [/Irrigate now/, /Irrigate in 6 hours/, /Irrigate tomorrow morning/, /No irrigation for 24 hours/]) {
      await user.click(screen.getByLabelText(label));
    }

    expect(screen.getByText("Select at least one candidate action.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simulate selected actions" })).toBeDisabled();
    expect(api.simulateActions).not.toHaveBeenCalled();
  });

  it("rejects wrong-state and mismatched simulation results safely", async () => {
    const user = userEvent.setup();
    renderPanel(endpoints({ ...simulation, state_id: "state-b" }));

    await user.click(screen.getByLabelText(/Irrigate in 6 hours/));
    await user.click(screen.getByLabelText(/Irrigate tomorrow morning/));
    await user.click(screen.getByRole("button", { name: "Simulate selected actions" }));

    expect(await screen.findByText("The backend returned simulation data for a different session.")).toBeInTheDocument();
  });

  it("prevents duplicate submission while pending and shows structured errors", async () => {
    const user = userEvent.setup();
    const api = endpoints();
    let reject!: (error: unknown) => void;
    vi.mocked(api.simulateActions).mockReturnValue(new Promise((_, fail) => {
      reject = fail;
    }));
    renderPanel(api);

    await user.click(screen.getByRole("button", { name: "Simulate selected actions" }));
    await user.click(screen.getByRole("button", { name: "Simulating selected actions" }));

    expect(api.simulateActions).toHaveBeenCalledTimes(1);
    reject(new CropTwinApiError({
      kind: "api",
      status: 409,
      code: "CURRENT_STATE_NOT_FOUND",
      message: "Current state missing.",
    }));
    expect(await screen.findByText("Current state missing.")).toBeInTheDocument();
  });
});
