import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  useWorkflowDispatch,
  useWorkflowState,
  WorkflowProvider,
} from "@/features/workflow/workflow-context";
import type {
  SessionResponse,
  WaterStateResponse,
  WeatherInput,
  WeatherSnapshotResponse,
} from "@/lib/types/api";
import type { WorkflowState } from "@/features/workflow/workflow-types";
import { WaterPanel, type WaterPanelEndpoints } from "./water-panel";

const sessionA: SessionResponse = {
  state_id: "state-a",
  crop_type: "tomato",
  planting_date: "2026-07-01",
  location: { name: "Farm A", latitude: 17, longitude: 78, elevation_m: 500 },
  soil_texture: "sandy_loam",
  created_at: "2026-07-31T00:00:00Z",
};

const sessionB: SessionResponse = {
  ...sessionA,
  state_id: "state-b",
  location: { ...sessionA.location, name: "Farm B" },
};

const weatherDraft: WeatherInput = {
  tmin_c: 20,
  tmax_c: 31,
  humidity_pct: 60,
  wind_speed_mps: 2,
  shortwave_radiation_sum_mj_m2: null,
  rainfall_mm: 0,
  eto_reference_feed: null,
};

const weatherSnapshot: WeatherSnapshotResponse = {
  ...weatherDraft,
  state_id: "state-a",
  target_date: "2026-08-02",
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
  eto_method: "hargreaves_samani",
  eto_reference_feed: null,
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
  observed_at: "2026-08-02T00:00:00Z",
  computed_at: "2026-08-02T01:00:00Z",
  observation_time_basis: "DATE_ONLY_UTC_START",
};

function activeState(overrides: Partial<WorkflowState> = {}): WorkflowState {
  const state: WorkflowState = {
    activeStateId: "state-a",
    session: sessionA,
    loadedCurrentState: null,
    systemInfo: null,
    disease: null,
    diseaseRequestPending: false,
    activeDiseaseRequestId: null,
    weatherSnapshot: null,
    weatherDraft,
    weatherDate: null,
    water: null,
    waterComputationPending: false,
    activeWaterRequestId: null,
    activeWaterRequestSignature: null,
    twin: null,
    twinUpdatePending: false,
    activeTwinRequestId: null,
    activeTwinSourceSignature: null,
    latestWaterObservationId: null,
    latestWaterSequence: 0,
    advancementPending: false,
    activeAdvancementRequestId: null,
    activeAdvancementRequestSignature: null,
    latestAdvancement: null,
    retainedAdvancement: null,
    advancementNotice: null,
    advancementTransitionKind: null,
    advancementTwinRefreshStatus: null,
    ...overrides,
  };
  return state;
}

function fakeEndpoints(response: WaterStateResponse = waterState): WaterPanelEndpoints {
  return {
    computeWaterState: vi.fn().mockResolvedValue(response),
  };
}

function renderWaterPanel(
  endpoints = fakeEndpoints(),
  initialState = activeState(),
) {
  return {
    endpoints,
    ...render(
      <WorkflowProvider initialState={initialState}>
        <WaterPanel endpoints={endpoints} />
      </WorkflowProvider>,
    ),
  };
}

function deferredWater() {
  let resolve!: (response: WaterStateResponse) => void;
  const promise = new Promise<WaterStateResponse>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("WaterPanel", () => {
  it("defaults water computation date to the fetched weather snapshot date", async () => {
    renderWaterPanel(fakeEndpoints(), activeState({
      weatherSnapshot,
      weatherDate: weatherSnapshot.target_date,
      weatherDraft: {
        ...weatherDraft,
        shortwave_radiation_sum_mj_m2: 18,
        eto_reference_feed: 4.5,
      },
    }));

    await waitFor(() =>
      expect(screen.getByLabelText("Water computation date")).toHaveValue("2026-08-02"),
    );
  });

  it("warns when reviewed weather originated from another date", async () => {
    const user = userEvent.setup();
    renderWaterPanel(fakeEndpoints(), activeState({
      weatherSnapshot,
      weatherDate: weatherSnapshot.target_date,
    }));

    const dateInput = screen.getByLabelText("Water computation date");
    await waitFor(() => expect(dateInput).toHaveValue("2026-08-02"));
    await user.clear(dateInput);
    await user.type(dateInput, "2026-08-03");

    expect(screen.getByText(/Reviewed weather originated from 2026-08-02/)).toBeInTheDocument();
  });

  it("submits no-irrigation mode with no event", async () => {
    const endpoints = fakeEndpoints();
    const user = userEvent.setup();
    renderWaterPanel(endpoints);

    await user.click(screen.getByRole("button", { name: "Compute water state" }));

    await waitFor(() => expect(endpoints.computeWaterState).toHaveBeenCalledTimes(1));
    expect(endpoints.computeWaterState).toHaveBeenCalledWith(
      "state-a",
      expect.objectContaining({ last_irrigation_event: null }),
      expect.anything(),
    );
  });

  it("submits valid zero-depth mode as no event", async () => {
    const endpoints = fakeEndpoints();
    const user = userEvent.setup();
    renderWaterPanel(endpoints);

    await user.selectOptions(screen.getByLabelText("Input mode"), "direct");
    await user.click(screen.getByRole("button", { name: "Compute water state" }));

    await waitFor(() => expect(endpoints.computeWaterState).toHaveBeenCalledTimes(1));
    expect(endpoints.computeWaterState).toHaveBeenCalledWith(
      "state-a",
      expect.objectContaining({ last_irrigation_event: null }),
      expect.anything(),
    );
  });

  it("prevents invalid litres-over-area from submitting", async () => {
    const endpoints = fakeEndpoints();
    const user = userEvent.setup();
    renderWaterPanel(endpoints);

    await user.selectOptions(screen.getByLabelText("Input mode"), "litres_area");

    expect(await screen.findByText("Irrigated area (m2) must be greater than 0.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compute water state" })).toBeDisabled();
    expect(endpoints.computeWaterState).not.toHaveBeenCalled();
  });

  it("prevents invalid drip details from submitting", async () => {
    const endpoints = fakeEndpoints();
    const user = userEvent.setup();
    renderWaterPanel(endpoints);

    await user.selectOptions(screen.getByLabelText("Input mode"), "drip_runtime");

    expect(await screen.findByText("Emitter count must be a positive integer.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compute water state" })).toBeDisabled();
    expect(endpoints.computeWaterState).not.toHaveBeenCalled();
  });

  it("prevents negative direct depth from submitting", async () => {
    const endpoints = fakeEndpoints();
    const user = userEvent.setup();
    renderWaterPanel(endpoints);

    await user.selectOptions(screen.getByLabelText("Input mode"), "direct");
    const depthInput = screen.getByLabelText("Irrigation depth (mm)");
    await user.clear(depthInput);
    await user.type(depthInput, "-1");

    expect(await screen.findByText("Irrigation depth (mm) must be >= 0.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compute water state" })).toBeDisabled();
    expect(endpoints.computeWaterState).not.toHaveBeenCalled();
  });

  it("re-enables submission after correcting irrigation input", async () => {
    const endpoints = fakeEndpoints();
    const user = userEvent.setup();
    renderWaterPanel(endpoints);

    await user.selectOptions(screen.getByLabelText("Input mode"), "litres_area");
    expect(await screen.findByText("Irrigated area (m2) must be greater than 0.")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Total water applied (litres)"));
    await user.type(screen.getByLabelText("Total water applied (litres)"), "100");
    await user.clear(screen.getByLabelText("Irrigated area (m2)"));
    await user.type(screen.getByLabelText("Irrigated area (m2)"), "20");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Compute water state" })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: "Compute water state" }));

    await waitFor(() => expect(endpoints.computeWaterState).toHaveBeenCalledTimes(1));
    expect(endpoints.computeWaterState).toHaveBeenCalledWith(
      "state-a",
      expect.objectContaining({
        last_irrigation_event: expect.objectContaining({
          amount_mm: 5,
          source: "CONVERTED_FROM_LITRES",
        }),
      }),
      expect.anything(),
    );
  });

  it("resets irrigation input and request state when the active session changes", async () => {
    const endpoints = fakeEndpoints({ ...waterState, state_id: "state-b" });
    const user = userEvent.setup();

    function SwitchSession() {
      const dispatch = useWorkflowDispatch();
      return (
        <Button
          type="button"
          onClick={() => {
            dispatch({ type: "sessionLoaded", session: { ...sessionB, current_state: {} as never } });
            dispatch({
              type: "weatherDraftChanged",
              stateId: "state-b",
              draft: weatherDraft,
            });
          }}
        >
          Switch session
        </Button>
      );
    }

    render(
      <WorkflowProvider initialState={activeState()}>
        <SwitchSession />
        <WaterPanel endpoints={endpoints} />
      </WorkflowProvider>,
    );

    await user.selectOptions(screen.getByLabelText("Input mode"), "direct");
    await user.clear(screen.getByLabelText("Irrigation depth (mm)"));
    await user.type(screen.getByLabelText("Irrigation depth (mm)"), "6");
    await user.click(screen.getByRole("button", { name: "Switch session" }));

    await waitFor(() => expect(screen.getByLabelText("Input mode")).toHaveValue("none"));
    expect(screen.queryByDisplayValue("6")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Compute water state" }));
    await waitFor(() => expect(endpoints.computeWaterState).toHaveBeenCalledTimes(1));
    expect(endpoints.computeWaterState).toHaveBeenCalledWith(
      "state-b",
      expect.objectContaining({ last_irrigation_event: null }),
      expect.anything(),
    );
  });

  it("discards a returned water response when the accepted payload changed", async () => {
    const deferred = deferredWater();
    const endpoints: WaterPanelEndpoints = {
      computeWaterState: vi.fn().mockReturnValue(deferred.promise),
    };
    const user = userEvent.setup();

    function MutateWeather() {
      const dispatch = useWorkflowDispatch();
      return (
        <Button
          type="button"
          onClick={() =>
            dispatch({
              type: "weatherDraftChanged",
              stateId: "state-a",
              draft: { ...weatherDraft, rainfall_mm: 2 },
            })
          }
        >
          Mutate weather
        </Button>
      );
    }

    function WaterMarker() {
      const { water } = useWorkflowState();
      return <div>{water ? "stored-water" : "no-stored-water"}</div>;
    }

    render(
      <WorkflowProvider initialState={activeState()}>
        <MutateWeather />
        <WaterPanel endpoints={endpoints} />
        <WaterMarker />
      </WorkflowProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Compute water state" }));
    expect(screen.getByRole("button", { name: "Computing water state" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Mutate weather" }));
    deferred.resolve(waterState);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Compute water state" })).toBeEnabled(),
    );
    expect(screen.getByText("no-stored-water")).toBeInTheDocument();
    expect(screen.queryByText("stored-water")).not.toBeInTheDocument();
  });

  it("aborts water requests on unmount and releases pending state", async () => {
    const deferred = deferredWater();
    let signal: AbortSignal | undefined;
    const endpoints: WaterPanelEndpoints = {
      computeWaterState: vi.fn((_stateId, _request, options?: { signal?: AbortSignal }) => {
        signal = options?.signal;
        return deferred.promise;
      }),
    };
    const user = userEvent.setup();

    function PendingMarker() {
      const { waterComputationPending } = useWorkflowState();
      return <div>{waterComputationPending ? "water-pending" : "water-idle"}</div>;
    }

    function Harness() {
      const [showPanel, setShowPanel] = useState(true);
      return (
        <WorkflowProvider initialState={activeState()}>
          <Button type="button" onClick={() => setShowPanel(false)}>
            Hide water
          </Button>
          {showPanel ? <WaterPanel endpoints={endpoints} /> : null}
          <PendingMarker />
        </WorkflowProvider>
      );
    }

    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Compute water state" }));
    expect(screen.getByText("water-pending")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hide water" }));
    expect(signal?.aborted).toBe(true);
    deferred.resolve(waterState);

    await waitFor(() => expect(screen.getByText("water-idle")).toBeInTheDocument());
  });
});
