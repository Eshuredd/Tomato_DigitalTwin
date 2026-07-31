import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import {
  useWorkflowDispatch,
  useWorkflowState,
  WorkflowProvider,
} from "@/features/workflow/workflow-context";
import { DiseasePanel } from "@/features/disease/disease-panel";
import { WaterPanel } from "@/features/water/water-panel";
import { CropTwinApiError } from "@/lib/api/errors";
import type {
  DiseasePredictionResponse,
  SessionResponse,
  SessionStateResponse,
  UpdateTwinStateResponse,
  WaterStateResponse,
  WeatherInput,
} from "@/lib/types/api";
import type { WorkflowState } from "@/features/workflow/workflow-types";
import { TwinPanel, type TwinPanelEndpoints } from "./twin-panel";

const sessionA: SessionResponse = {
  state_id: "state-a",
  crop_type: "tomato",
  planting_date: "2026-07-01",
  location: { name: "Farm A", latitude: 17, longitude: 78, elevation_m: 500 },
  soil_texture: "sandy_loam",
  created_at: "2026-07-31T00:00:00Z",
};

const currentState = {
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
} as const;

const sessionB: SessionStateResponse = {
  ...sessionA,
  state_id: "state-b",
  location: { ...sessionA.location, name: "Farm B" },
  current_state: currentState,
};

const disease: DiseasePredictionResponse = {
  state_id: "state-a",
  crop_type: "tomato",
  predicted_label: "Tomato___healthy",
  disease_category: "none",
  class_probs: {
    Tomato___healthy: 0.9,
    Tomato___Late_blight: 0.1,
  },
  confidence_calibrated: 0.9,
  uncertainty_score: 0.1,
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

const water: WaterStateResponse = {
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
  raw_root_zone_depletion_mm: 8,
  root_zone_depletion_mm: 8,
  root_zone_depletion: 8,
  water_surplus_mm: 0,
  depletion_beyond_taw_mm: 0,
  estimated_moisture_state: "adequate",
  stress_band: "low",
  observed_at: "2026-07-31T00:00:00Z",
  computed_at: "2026-07-31T00:30:00Z",
  observation_time_basis: "DATE_ONLY_UTC_START",
};

const twin: UpdateTwinStateResponse = {
  state_id: "state-a",
  current_state: currentState,
  state_history_count: 1,
  snapshot_id: "snapshot-1",
  snapshot_created: true,
};

function activeState(overrides: Partial<WorkflowState> = {}): WorkflowState {
  const state: WorkflowState = {
    activeStateId: "state-a",
    session: sessionA,
    loadedCurrentState: null,
    systemInfo: null,
    disease,
    diseaseRequestPending: false,
    weatherSnapshot: null,
    weatherDraft,
    weatherDate: null,
    water,
    waterComputationPending: false,
    activeWaterRequestId: null,
    activeWaterRequestSignature: null,
    twin: null,
    twinUpdatePending: false,
    activeTwinRequestId: null,
    activeTwinSourceSignature: null,
    latestWaterObservationId: water.water_observation_id ?? null,
    latestWaterSequence: water.water_sequence,
    ...overrides,
  };
  return state;
}

function fakeEndpoints(response: UpdateTwinStateResponse = twin): TwinPanelEndpoints {
  return {
    updateTwinState: vi.fn().mockResolvedValue(response),
  };
}

function renderTwinPanel(
  endpoints = fakeEndpoints(),
  initialState = activeState(),
) {
  return {
    endpoints,
    ...render(
      <WorkflowProvider initialState={initialState}>
        <TwinPanel endpoints={endpoints} />
      </WorkflowProvider>,
    ),
  };
}

function deferredTwin() {
  let resolve!: (response: UpdateTwinStateResponse) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<UpdateTwinStateResponse>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, reject, resolve };
}

function StateMarker() {
  const { disease: acceptedDisease, twin: acceptedTwin, water: acceptedWater } = useWorkflowState();
  return (
    <div>
      <span>{acceptedDisease ? "has-disease" : "no-disease"}</span>
      <span>{acceptedWater ? "has-water" : "no-water"}</span>
      <span>{acceptedTwin ? "has-twin" : "no-twin"}</span>
    </div>
  );
}

describe("TwinPanel", () => {
  it("disables update without an active session", () => {
    renderTwinPanel(fakeEndpoints(), activeState({
      activeStateId: null,
      session: null,
      disease: null,
      water: null,
    }));

    expect(screen.getByText("Create or load an active session before updating the twin.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update canonical twin state" })).toBeDisabled();
  });

  it("disables update when disease is missing", () => {
    renderTwinPanel(fakeEndpoints(), activeState({ disease: null }));

    expect(screen.getByText("Submit disease evidence before updating the twin.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update canonical twin state" })).toBeDisabled();
  });

  it("disables update when water is missing", () => {
    renderTwinPanel(fakeEndpoints(), activeState({ water: null }));

    expect(screen.getByText("Compute water state before updating the twin.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update canonical twin state" })).toBeDisabled();
  });

  it("enables update when prerequisites are complete and calls the endpoint layer", async () => {
    const endpoints = fakeEndpoints();
    const user = userEvent.setup();
    renderTwinPanel(endpoints);

    await user.click(screen.getByRole("button", { name: "Update canonical twin state" }));

    await waitFor(() => expect(endpoints.updateTwinState).toHaveBeenCalledWith(
      "state-a",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ));
  });

  it("prevents duplicate submission while pending", async () => {
    const deferred = deferredTwin();
    const endpoints = { updateTwinState: vi.fn().mockReturnValue(deferred.promise) };
    const user = userEvent.setup();
    renderTwinPanel(endpoints);

    await user.click(screen.getByRole("button", { name: "Update canonical twin state" }));
    expect(screen.getByRole("button", { name: "Updating canonical twin state" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Updating canonical twin state" }));

    expect(endpoints.updateTwinState).toHaveBeenCalledTimes(1);
    deferred.resolve(twin);
    expect(await screen.findByText("A new canonical twin snapshot was created.")).toBeInTheDocument();
  });

  it("disables source controls while pending", () => {
    const sourcePanelEndpoints = {
      getSystemInfo: vi.fn().mockRejectedValue(new Error("offline")),
      predictDisease: vi.fn(),
      computeWaterState: vi.fn(),
    };

    render(
      <WorkflowProvider initialState={activeState({
        twinUpdatePending: true,
        activeTwinRequestId: "twin-1",
        activeTwinSourceSignature: "source-1",
      })}>
        <DiseasePanel endpoints={sourcePanelEndpoints} />
        <WaterPanel endpoints={sourcePanelEndpoints} />
        <TwinPanel endpoints={fakeEndpoints()} />
      </WorkflowProvider>,
    );

    expect(screen.getByLabelText("Tomato leaf image")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Compute water state" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Updating canonical twin state" })).toBeDisabled();
  });

  it("renders newly created and reused snapshot messages", async () => {
    const user = userEvent.setup();
    const endpoints = fakeEndpoints({ ...twin, snapshot_created: false });
    renderTwinPanel(endpoints);

    await user.click(screen.getByRole("button", { name: "Update canonical twin state" }));

    expect(await screen.findByText("The canonical twin already reflected the latest accepted observations.")).toBeInTheDocument();
  });

  it("renders full current-state fields including uncertainty and excess-water details", async () => {
    const user = userEvent.setup();
    renderTwinPanel(fakeEndpoints({
      ...twin,
      current_state: {
        ...currentState,
        uncertainty_band: "high",
        water_surplus_mm: 2.5,
        depletion_beyond_taw_mm: 1.25,
        eto_computed: 9.99,
      },
    }));

    await user.click(screen.getByRole("button", { name: "Update canonical twin state" }));

    expect(await screen.findByText("Canonical current twin")).toBeInTheDocument();
    expect(screen.getByText("development")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("Tomato___healthy")).toBeInTheDocument();
    expect(screen.getByText("none")).toBeInTheDocument();
    expect(screen.getByText("90.0%")).toBeInTheDocument();
    expect(screen.getByText("high")).toBeInTheDocument();
    expect(screen.getByText("9.99 mm")).toBeInTheDocument();
    expect(screen.getByText("3.20 mm")).toBeInTheDocument();
    expect(screen.getByText("8.00 mm")).toBeInTheDocument();
    expect(screen.getByText("adequate")).toBeInTheDocument();
    expect(screen.getByText("low")).toBeInTheDocument();
    expect(screen.getByText("2.50 mm")).toBeInTheDocument();
    expect(screen.getByText("1.25 mm")).toBeInTheDocument();
    expect(screen.getByText("2026-07-31T00:00:00Z")).toBeInTheDocument();
    expect(screen.getByText("2026-07-31T01:00:00Z")).toBeInTheDocument();
  });

  it("renders malformed response errors and mismatched state responses safely", async () => {
    const user = userEvent.setup();
    renderTwinPanel({
      updateTwinState: vi.fn().mockResolvedValue({ ...twin, state_id: "state-b" }),
    });

    await user.click(screen.getByRole("button", { name: "Update canonical twin state" }));

    expect(await screen.findByText("The backend returned twin state for a different session.")).toBeInTheDocument();
  });

  it("discards response after session switch and aborts the signal", async () => {
    const deferred = deferredTwin();
    let signal: AbortSignal | undefined;
    const endpoints = {
      updateTwinState: vi.fn((_stateId, options?: { signal?: AbortSignal }) => {
        signal = options?.signal;
        return deferred.promise;
      }),
    };
    const user = userEvent.setup();

    function SwitchSession() {
      const dispatch = useWorkflowDispatch();
      return (
        <Button type="button" onClick={() => dispatch({ type: "sessionLoaded", session: sessionB })}>
          Switch session
        </Button>
      );
    }

    render(
      <WorkflowProvider initialState={activeState()}>
        <SwitchSession />
        <TwinPanel endpoints={endpoints} />
        <StateMarker />
      </WorkflowProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Update canonical twin state" }));
    await user.click(screen.getByRole("button", { name: "Switch session" }));
    expect(signal?.aborted).toBe(true);
    deferred.resolve(twin);

    await waitFor(() => expect(screen.getByText("no-twin")).toBeInTheDocument());
  });

  it("discards response after accepted disease changes", async () => {
    const deferred = deferredTwin();
    const endpoints = { updateTwinState: vi.fn().mockReturnValue(deferred.promise) };
    const user = userEvent.setup();

    function MutateDisease() {
      const dispatch = useWorkflowDispatch();
      return (
        <Button
          type="button"
          onClick={() =>
            dispatch({
              type: "diseaseReceived",
              stateId: "state-a",
              disease: { ...disease, predicted_at: "2026-08-01T00:00:00Z" },
            })
          }
        >
          Mutate disease
        </Button>
      );
    }

    render(
      <WorkflowProvider initialState={activeState()}>
        <MutateDisease />
        <TwinPanel endpoints={endpoints} />
        <StateMarker />
      </WorkflowProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Update canonical twin state" }));
    await user.click(screen.getByRole("button", { name: "Mutate disease" }));
    deferred.resolve(twin);

    await waitFor(() => expect(screen.getByText("no-twin")).toBeInTheDocument());
  });

  it("discards response after accepted water changes", async () => {
    const deferred = deferredTwin();
    const endpoints = { updateTwinState: vi.fn().mockReturnValue(deferred.promise) };
    const user = userEvent.setup();

    function MutateWater() {
      const dispatch = useWorkflowDispatch();
      return (
        <Button
          type="button"
          onClick={() =>
            dispatch({
              type: "waterReceived",
              stateId: "state-a",
              water: { ...water, water_observation_id: "water-observation-2", water_sequence: 2 },
            })
          }
        >
          Mutate water
        </Button>
      );
    }

    render(
      <WorkflowProvider initialState={activeState()}>
        <MutateWater />
        <TwinPanel endpoints={endpoints} />
        <StateMarker />
      </WorkflowProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Update canonical twin state" }));
    await user.click(screen.getByRole("button", { name: "Mutate water" }));
    deferred.resolve(twin);

    await waitFor(() => expect(screen.getByText("no-twin")).toBeInTheDocument());
  });

  it("aborts on unmount", async () => {
    const deferred = deferredTwin();
    let signal: AbortSignal | undefined;
    const endpoints = {
      updateTwinState: vi.fn((_stateId, options?: { signal?: AbortSignal }) => {
        signal = options?.signal;
        return deferred.promise;
      }),
    };
    const user = userEvent.setup();
    const view = renderTwinPanel(endpoints);

    await user.click(screen.getByRole("button", { name: "Update canonical twin state" }));
    view.unmount();

    expect(signal?.aborted).toBe(true);
  });

  it("shows structured backend errors safely, retains sources and permits retry after timeout", async () => {
    const timeout = new CropTwinApiError({
      kind: "timeout",
      status: null,
      code: "FRONTEND_REQUEST_TIMEOUT",
      message: "The CropTwin API request timed out.",
    });
    const structured = new CropTwinApiError({
      kind: "api",
      status: 409,
      code: "INCOMPLETE_STATE",
      message: "Current state is incomplete.",
      details: { missing: ["latest_water_state"], image_base64: "secret" },
    });
    const endpoints = {
      updateTwinState: vi.fn()
        .mockRejectedValueOnce(timeout)
        .mockRejectedValueOnce(structured)
        .mockResolvedValueOnce(twin),
    };
    const user = userEvent.setup();
    render(
      <WorkflowProvider initialState={activeState()}>
        <TwinPanel endpoints={endpoints} />
        <StateMarker />
      </WorkflowProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Update canonical twin state" }));
    expect(await screen.findByText("The CropTwin API request timed out.")).toBeInTheDocument();
    expect(screen.getByText("has-disease")).toBeInTheDocument();
    expect(screen.getByText("has-water")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Update canonical twin state" }));
    expect(await screen.findByText("Current state is incomplete.")).toBeInTheDocument();
    expect(screen.getByText(/INCOMPLETE_STATE/)).toBeInTheDocument();
    expect(screen.getByText(/\[redacted\]/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Update canonical twin state" }));
    expect(await screen.findByText("A new canonical twin snapshot was created.")).toBeInTheDocument();
  });

  it("does not fabricate snapshot IDs when absent or call later workflow endpoints", async () => {
    const simulateActions = vi.fn();
    const recommend = vi.fn();
    const user = userEvent.setup();
    renderTwinPanel({
      updateTwinState: vi.fn().mockResolvedValue({
        ...twin,
        snapshot_id: null,
      }),
      simulateActions,
      recommend,
    } as unknown as TwinPanelEndpoints);

    await user.click(screen.getByRole("button", { name: "Update canonical twin state" }));

    expect(await screen.findByText("A new canonical twin snapshot was created.")).toBeInTheDocument();
    expect(screen.queryByText("snapshot-")).not.toBeInTheDocument();
    expect(simulateActions).not.toHaveBeenCalled();
    expect(recommend).not.toHaveBeenCalled();
  });
});
