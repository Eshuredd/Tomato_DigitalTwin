import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useWorkflowState, WorkflowProvider } from "@/features/workflow/workflow-context";
import { WaterPanel } from "@/features/water/water-panel";
import type {
  SessionResponse,
  WaterStateResponse,
  WeatherInput,
  WeatherSnapshotResponse,
} from "@/lib/types/api";
import { initialWorkflowState, type WorkflowState } from "@/features/workflow/workflow-types";
import { WeatherPanel, type WeatherPanelEndpoints } from "./weather-panel";

const sessionA: SessionResponse = {
  state_id: "state-a",
  crop_type: "tomato",
  planting_date: "2026-07-01",
  location: { name: "Farm A", latitude: 17, longitude: 78, elevation_m: 500 },
  soil_texture: "sandy_loam",
  created_at: "2026-07-31T00:00:00Z",
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
  target_date: "2026-08-04",
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
  observed_at: "2026-08-04T00:00:00Z",
  computed_at: "2026-08-04T01:00:00Z",
  observation_time_basis: "DATE_ONLY_UTC_START",
};

function activeState(overrides: Partial<WorkflowState> = {}): WorkflowState {
  const state: WorkflowState = {
    ...initialWorkflowState,
    activeStateId: "state-a",
    session: sessionA,
    weatherDraft,
    ...overrides,
  };
  return state;
}

function fakeWeatherEndpoints(): WeatherPanelEndpoints {
  return {
    getWeatherSnapshot: vi.fn().mockResolvedValue(weatherSnapshot),
  };
}

function deferredWeather() {
  let resolve!: (response: WeatherSnapshotResponse) => void;
  const promise = new Promise<WeatherSnapshotResponse>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function WeatherMarker() {
  const { weatherSnapshot } = useWorkflowState();
  return <div>{weatherSnapshot ? "has-weather" : "no-weather"}</div>;
}

describe("WeatherPanel", () => {
  it("initializes the weather date at the planting date when planting is in the future", () => {
    render(
      <WorkflowProvider initialState={activeState({
        session: { ...sessionA, planting_date: "2027-01-01" },
      })}>
        <WeatherPanel endpoints={fakeWeatherEndpoints()} />
      </WorkflowProvider>,
    );

    expect(screen.getByLabelText("Weather date")).toHaveValue("2027-01-01");
    expect(screen.getByLabelText("Weather date")).toHaveAttribute("min", "2027-01-01");
  });

  it("applies fetched weather date as the default water computation date", async () => {
    const user = userEvent.setup();
    const weatherEndpoints = fakeWeatherEndpoints();
    const waterEndpoints = {
      computeWaterState: vi.fn().mockResolvedValue(waterState),
    };

    render(
      <WorkflowProvider initialState={activeState({ weatherDraft: null })}>
        <WeatherPanel endpoints={weatherEndpoints} />
        <WaterPanel endpoints={waterEndpoints} />
      </WorkflowProvider>,
    );

    fireEvent.change(screen.getByLabelText("Weather date"), {
      target: { value: "2026-08-04" },
    });
    await user.click(screen.getByRole("button", { name: "Retrieve weather snapshot" }));

    expect(await screen.findByText("Weather snapshot loaded for 2026-08-04.")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText("Water computation date")).toHaveValue("2026-08-04"),
    );
  });

  it("invalidates the workflow draft and water result after an invalid weather edit", async () => {
    const user = userEvent.setup();
    const waterEndpoints = {
      computeWaterState: vi.fn().mockResolvedValue(waterState),
    };

    render(
      <WorkflowProvider initialState={activeState({ water: waterState })}>
        <WeatherPanel endpoints={fakeWeatherEndpoints()} />
        <WaterPanel endpoints={waterEndpoints} />
      </WorkflowProvider>,
    );

    expect(screen.getByRole("heading", { name: "Deterministic water state" })).toBeInTheDocument();
    const tminInput = screen.getByLabelText("Minimum temperature (C)");
    await user.clear(tminInput);

    expect(tminInput).toHaveValue(null);
    expect(await screen.findByText("Minimum temperature (C) is required.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Deterministic water state" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compute water state" })).toBeDisabled();

    await user.type(tminInput, "21");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Compute water state" })).toBeEnabled(),
    );
    expect(screen.queryByRole("heading", { name: "Deterministic water state" })).not.toBeInTheDocument();
  });

  it("disables weather controls while water computation is pending", async () => {
    const pendingState = activeState({
      waterComputationPending: true,
      activeWaterRequestId: "request-1",
      activeWaterRequestSignature: "signature-1",
    });

    render(
      <WorkflowProvider initialState={pendingState}>
        <WeatherPanel endpoints={fakeWeatherEndpoints()} />
      </WorkflowProvider>,
    );

    expect(screen.getByLabelText("Weather date")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Retrieve weather snapshot" })).toBeDisabled();
    expect(screen.getByLabelText("Minimum temperature (C)")).toBeDisabled();
  });

  it("disables weather retrieval and editing while advancement is pending", () => {
    render(
      <WorkflowProvider initialState={activeState({
        advancementPending: true,
        activeAdvancementRequestId: "advancement-1",
        activeAdvancementRequestSignature: "signature-1",
      })}>
        <WeatherPanel endpoints={fakeWeatherEndpoints()} />
      </WorkflowProvider>,
    );

    expect(screen.getByLabelText("Weather date")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Retrieve weather snapshot" })).toBeDisabled();
    expect(screen.getByLabelText("Minimum temperature (C)")).toBeDisabled();
  });

  it("aborts weather requests on unmount and does not store late responses", async () => {
    const deferred = deferredWeather();
    let signal: AbortSignal | undefined;
    const endpoints: WeatherPanelEndpoints = {
      getWeatherSnapshot: vi.fn((_stateId, _targetDate, options?: { signal?: AbortSignal }) => {
        signal = options?.signal;
        return deferred.promise;
      }),
    };
    const user = userEvent.setup();

    function Harness() {
      const [showPanel, setShowPanel] = useState(true);
      return (
        <WorkflowProvider initialState={activeState({ weatherDraft: null })}>
          <Button type="button" onClick={() => setShowPanel(false)}>
            Hide weather
          </Button>
          {showPanel ? <WeatherPanel endpoints={endpoints} /> : null}
          <WeatherMarker />
        </WorkflowProvider>
      );
    }

    render(<Harness />);

    fireEvent.change(screen.getByLabelText("Weather date"), {
      target: { value: "2026-08-04" },
    });
    await user.click(screen.getByRole("button", { name: "Retrieve weather snapshot" }));
    await user.click(screen.getByRole("button", { name: "Hide weather" }));
    expect(signal?.aborted).toBe(true);

    deferred.resolve(weatherSnapshot);

    await waitFor(() => expect(screen.getByText("no-weather")).toBeInTheDocument());
  });
});
