import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import {
  useWorkflowDispatch,
  useWorkflowState,
  WorkflowProvider,
} from "@/features/workflow/workflow-context";
import { initialWorkflowState } from "@/features/workflow/workflow-types";
import { CropTwinApiError } from "@/lib/api/errors";
import type {
  RecommendationResponse,
  SimulateActionsResponse,
  UpdateTwinStateResponse,
} from "@/lib/types/api";
import { RecommendationPanel, type RecommendationPanelEndpoints } from "./recommendation-panel";
import {
  recommendationSourceSignature,
  simulationSourceSignature,
} from "./decision-utils";

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

const acceptedSimulationActions = ["IRRIGATE_NOW"] as const;
const acceptedSimulationSourceSignature = simulationSourceSignature({
  actions: [...acceptedSimulationActions],
  stateId: "state-a",
  twin,
});
const acceptedRecommendationSourceSignature = recommendationSourceSignature({
  simulation,
  stateId: "state-a",
  twin,
});

function endpoints(response: RecommendationResponse = recommendation): RecommendationPanelEndpoints {
  return {
    recommend: vi.fn().mockResolvedValue(response),
  };
}

function deferredRecommendation() {
  let resolve!: (response: RecommendationResponse) => void;
  const promise = new Promise<RecommendationResponse>((next) => {
    resolve = next;
  });
  return { promise, resolve };
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
          acceptedSimulationActions: [...acceptedSimulationActions],
          acceptedSimulationSourceSignature,
          acceptedRecommendationSourceSignature,
          ...overrides,
        }}
      >
        <RecommendationPanel endpoints={api} />
      </WorkflowProvider>,
    ),
  };
}

function DecisionMarker() {
  const { recommendation: acceptedRecommendation, recommendationPending, simulation: acceptedSimulation } = useWorkflowState();
  return (
    <div>
      <span>{recommendationPending ? "recommendation-pending" : "recommendation-idle"}</span>
      <span>simulation:{acceptedSimulation?.simulations.length ?? 0}</span>
      <span>recommendation:{acceptedRecommendation?.chosen_action ?? "none"}</span>
    </div>
  );
}

function InvalidateSimulationButton() {
  const dispatch = useWorkflowDispatch();
  return (
    <Button
      type="button"
      onClick={() => dispatch({ type: "simulationInvalidated", stateId: "state-a" })}
    >
      Invalidate simulation
    </Button>
  );
}

function MeaningfulTwinChangeButton() {
  const dispatch = useWorkflowDispatch();
  return (
    <Button
      type="button"
      onClick={() => dispatch({
        type: "twinReceived",
        stateId: "state-a",
        twin: {
          ...twin,
          current_state: {
            ...twin.current_state,
            root_zone_depletion: twin.current_state.root_zone_depletion + 1,
          },
        },
      })}
    >
      Meaningful twin change
    </Button>
  );
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
    expect(screen.getByText("Avoid overhead irrigation.")).toBeInTheDocument();
    expect(screen.getByText("Field inspection is advised; disease is not confirmed by this output.")).toBeInTheDocument();
    expect(screen.getByText(/Wetness-sensitive fungal-risk evidence influenced the constraint/)).toBeInTheDocument();
    expect(screen.getByText(/FastAPI's deterministic recommendation engine selected the action/)).toBeInTheDocument();
    expect(screen.getByText(/not pesticide, fertiliser or disease-treatment advice/)).toBeInTheDocument();
  });

  it("is disabled without a usable accepted simulation", () => {
    const { api } = renderPanel(endpoints(), { simulation: null });

    expect(screen.getByText("Simulate candidate actions before recommendation.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate deterministic recommendation" })).toBeDisabled();
    expect(api.recommend).not.toHaveBeenCalled();
  });

  it.each([
    [
      "accepted actions do not match results",
      { acceptedSimulationActions: ["IRRIGATE_NOW", "NO_IRRIGATION_24H"] },
    ],
    [
      "accepted source signature does not match current twin",
      { acceptedSimulationSourceSignature: simulationSourceSignature({
        actions: [...acceptedSimulationActions],
        stateId: "state-a",
        twin: { ...twin, snapshot_id: "snapshot-2" },
      }) },
    ],
    [
      "simulation state ID differs",
      { simulation: { ...simulation, state_id: "state-b" } },
    ],
    [
      "accepted actions contain duplicates",
      { acceptedSimulationActions: ["IRRIGATE_NOW", "IRRIGATE_NOW"] },
    ],
    [
      "simulation has duplicate results",
      { simulation: { ...simulation, simulations: [simulation.simulations[0], simulation.simulations[0]] } },
    ],
    [
      "simulation is missing a result",
      { simulation: { ...simulation, simulations: [] } },
    ],
    [
      "simulation has an unexpected result",
      { simulation: {
        ...simulation,
        simulations: [
          ...simulation.simulations,
          {
            action: "NO_IRRIGATION_24H",
            projected_root_zone_depletion: 18,
            projected_raw_crossing: false,
            projected_stress_band: "medium",
            projected_water_use: 0,
            disease_wetness_risk_note: "note",
          },
        ],
      } },
    ],
  ])("blocks recommendation when %s", (_label, overrides) => {
    const { api } = renderPanel(endpoints(), {
      recommendation,
      acceptedRecommendationSourceSignature,
      ...overrides,
    });

    expect(screen.getByText("Run candidate-action simulation for the current canonical twin before requesting a recommendation.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate deterministic recommendation" })).toBeDisabled();
    expect(screen.getByRole("heading", { name: "No recommendation yet" })).toBeInTheDocument();
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

  it("ignores late recommendation responses after accepted simulation invalidation", async () => {
    const deferred = deferredRecommendation();
    let signal: AbortSignal | undefined;
    const api = {
      recommend: vi.fn((_stateId, options?: { signal?: AbortSignal }) => {
        signal = options?.signal;
        return deferred.promise;
      }),
    };
    const user = userEvent.setup();
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
          simulation,
          acceptedSimulationActions: [...acceptedSimulationActions],
          acceptedSimulationSourceSignature,
        }}
      >
        <InvalidateSimulationButton />
        <DecisionMarker />
        <RecommendationPanel endpoints={api} />
      </WorkflowProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Generate deterministic recommendation" }));
    expect(screen.getByText("recommendation-pending")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Invalidate simulation" }));
    expect(signal?.aborted).toBe(true);
    deferred.resolve(recommendation);

    await waitFor(() => expect(screen.getByText("recommendation-idle")).toBeInTheDocument());
    expect(screen.getByText("simulation:0")).toBeInTheDocument();
    expect(screen.getByText("recommendation:none")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No recommendation yet" })).toBeInTheDocument();
  });

  it("ignores late recommendation responses after canonical twin source changes", async () => {
    const deferred = deferredRecommendation();
    let signal: AbortSignal | undefined;
    const api = {
      recommend: vi.fn((_stateId, options?: { signal?: AbortSignal }) => {
        signal = options?.signal;
        return deferred.promise;
      }),
    };
    const user = userEvent.setup();
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
          simulation,
          acceptedSimulationActions: [...acceptedSimulationActions],
          acceptedSimulationSourceSignature,
        }}
      >
        <MeaningfulTwinChangeButton />
        <DecisionMarker />
        <RecommendationPanel endpoints={api} />
      </WorkflowProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Generate deterministic recommendation" }));
    expect(screen.getByText("recommendation-pending")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Meaningful twin change" }));
    expect(signal?.aborted).toBe(true);
    deferred.resolve(recommendation);

    await waitFor(() => expect(screen.getByText("recommendation-idle")).toBeInTheDocument());
    expect(screen.getByText("simulation:0")).toBeInTheDocument();
    expect(screen.getByText("recommendation:none")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No recommendation yet" })).toBeInTheDocument();
  });
});
