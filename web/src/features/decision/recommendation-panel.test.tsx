import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WorkflowProvider } from "@/features/workflow/workflow-context";
import { initialWorkflowState } from "@/features/workflow/workflow-types";
import { CropTwinApiError } from "@/lib/api/errors";
import type {
  RecommendationResponse,
  SimulateActionsResponse,
  UpdateTwinStateResponse,
} from "@/lib/types/api";
import { RecommendationPanel, type RecommendationPanelEndpoints } from "./recommendation-panel";

const twin = {
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
} satisfies UpdateTwinStateResponse;

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
  ],
};

const recommendation: RecommendationResponse = {
  recommendation_id: "recommendation-1",
  state_id: "state-a",
  chosen_action: "IRRIGATE_NOW",
  irrigation_constraint: "AVOID_OVERHEAD_IRRIGATION",
  inspection_advisory: true,
  decision_reason_codes: ["CURRENT_DEPLETION_EXCEEDS_RAW", "FUNGAL_WETNESS_RISK"],
  caution_reasons: ["HIGH_UNCERTAINTY", "FUNGAL_DISEASE_RISK"],
  evidence_summary_structured: { chosen_action: "IRRIGATE_NOW" },
  recommended_at: "2026-07-31T02:10:00Z",
};

function endpoints(response: RecommendationResponse = recommendation): RecommendationPanelEndpoints {
  return {
    recommend: vi.fn().mockResolvedValue(response),
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
          simulation,
          ...overrides,
        }}
      >
        <RecommendationPanel endpoints={api} />
      </WorkflowProvider>,
    ),
  };
}

describe("RecommendationPanel", () => {
  it("requires explicit submission and sends no chosen action", async () => {
    const user = userEvent.setup();
    const { api } = renderPanel();

    expect(api.recommend).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Generate deterministic recommendation" }));

    await waitFor(() => expect(api.recommend).toHaveBeenCalledWith(
      "state-a",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ));
    expect(api.recommend).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Irrigate now")).toBeInTheDocument();
    expect(screen.getByText("IRRIGATE_NOW")).toBeInTheDocument();
    expect(screen.getByText("Avoid overhead irrigation")).toBeInTheDocument();
    expect(screen.getByText("Inspect crop conditions")).toBeInTheDocument();
    expect(screen.getByText(/Fungal disease risk/)).toBeInTheDocument();
    expect(screen.queryByText(/pesticide/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/treatment/i)).not.toBeInTheDocument();
  });

  it("is disabled without a usable accepted simulation", () => {
    const { api } = renderPanel(endpoints(), { simulation: null });

    expect(screen.getByText("Simulate candidate actions before recommendation.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate deterministic recommendation" })).toBeDisabled();
    expect(api.recommend).not.toHaveBeenCalled();
  });

  it("rejects recommendations for unsimulated actions and preserves retry", async () => {
    const user = userEvent.setup();
    const api = endpoints({ ...recommendation, chosen_action: "NO_IRRIGATION_24H" });
    renderPanel(api);

    await user.click(screen.getByRole("button", { name: "Generate deterministic recommendation" }));

    expect(await screen.findByText("The backend recommended an action that was not in the accepted simulation.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate deterministic recommendation" })).toBeEnabled();
  });

  it("prevents duplicate submission while pending and displays structured errors", async () => {
    const user = userEvent.setup();
    const api = endpoints();
    let reject!: (error: unknown) => void;
    vi.mocked(api.recommend).mockReturnValue(new Promise((_, fail) => {
      reject = fail;
    }));
    renderPanel(api);

    await user.click(screen.getByRole("button", { name: "Generate deterministic recommendation" }));
    await user.click(screen.getByRole("button", { name: "Generating recommendation" }));

    expect(api.recommend).toHaveBeenCalledTimes(1);
    reject(new CropTwinApiError({
      kind: "api",
      status: 404,
      code: "RELATED_SIMULATION_NOT_FOUND",
      message: "Simulation missing.",
    }));
    expect(await screen.findByText("Simulation missing.")).toBeInTheDocument();
  });
});
