import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import {
  useWorkflowDispatch,
  useWorkflowState,
  WorkflowProvider,
} from "@/features/workflow/workflow-context";
import { CropTwinApiError } from "@/lib/api/errors";
import type {
  AdvanceOneDayResponse,
  DiseasePredictionResponse,
  SessionResponse,
  UpdateTwinStateResponse,
  WaterStateResponse,
  WeatherInput,
  WeatherSnapshotResponse,
} from "@/lib/types/api";
import { initialWorkflowState, type WorkflowState } from "@/features/workflow/workflow-types";
import { AdvancementPanel, type AdvancementPanelEndpoints } from "./advancement-panel";

const session: SessionResponse = {
  state_id: "state-a",
  crop_type: "tomato",
  planting_date: "2026-07-01",
  location: { name: "Farm A", latitude: 17, longitude: 78, elevation_m: 500 },
  soil_texture: "sandy_loam",
  created_at: "2026-07-31T00:00:00Z",
};

const disease: DiseasePredictionResponse = {
  state_id: "state-a",
  crop_type: "tomato",
  predicted_label: "Tomato___healthy",
  disease_category: "none",
  class_probs: { Tomato___healthy: 0.9 },
  confidence_calibrated: 0.9,
  uncertainty_score: 0.1,
  uncertainty_band: "low",
  predicted_at: "2026-07-31T00:00:00Z",
};

const weather: WeatherInput = {
  tmin_c: 20,
  tmax_c: 31,
  humidity_pct: 60,
  wind_speed_mps: 2,
  shortwave_radiation_sum_mj_m2: 18,
  rainfall_mm: 0,
  eto_reference_feed: 4.5,
};

const weatherSnapshot: WeatherSnapshotResponse = {
  ...weather,
  state_id: "state-a",
  target_date: "2026-08-01",
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

const water: WaterStateResponse = {
  state_id: "state-a",
  water_observation_id: "water-1",
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
  computed_at: "2026-07-31T01:00:00Z",
  observation_time_basis: "DATE_ONLY_UTC_START",
};

const twin: UpdateTwinStateResponse = {
  state_id: "state-a",
  current_state: currentState,
  state_history_count: 1,
  snapshot_id: "snapshot-1",
  snapshot_created: true,
};

const advancedWater: WaterStateResponse = {
  ...water,
  water_observation_id: "water-2",
  water_sequence: 2,
  base_water_observation_id: "water-1",
  base_water_sequence: 1,
  observed_at: "2026-08-01T00:00:00Z",
};

const advancement: AdvanceOneDayResponse = {
  state_id: "state-a",
  advancement_id: "advancement-fixed",
  target_date: "2026-08-01",
  advancement_created: true,
  water_state: advancedWater,
  twin_state: {
    ...twin,
    snapshot_id: "snapshot-2",
    current_state: {
      ...currentState,
      observed_at: "2026-08-01T00:00:00Z",
      last_update_time: "2026-08-01T01:00:00Z",
    },
  },
};

function activeState(overrides: Partial<WorkflowState> = {}): WorkflowState {
  return {
    ...initialWorkflowState,
    activeStateId: "state-a",
    session,
    disease,
    weatherSnapshot,
    weatherDraft: weather,
    weatherDate: "2026-08-01",
    water,
    twin,
    latestWaterObservationId: "water-1",
    latestWaterSequence: 1,
    ...overrides,
  };
}

function fakeEndpoints(response: AdvanceOneDayResponse = advancement): AdvancementPanelEndpoints {
  return {
    advanceOneDay: vi.fn().mockResolvedValue(response),
    updateTwinState: vi.fn().mockResolvedValue({ ...twin, snapshot_id: "snapshot-authoritative" }),
  };
}

function renderAdvancementPanel(
  endpoints = fakeEndpoints(),
  initialState = activeState(),
) {
  return {
    endpoints,
    ...render(
      <WorkflowProvider initialState={initialState}>
        <AdvancementPanel endpoints={endpoints} />
      </WorkflowProvider>,
    ),
  };
}

function deferredAdvancement() {
  let resolve!: (response: AdvanceOneDayResponse) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<AdvanceOneDayResponse>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, reject, resolve };
}

function StateMarker() {
  const {
    latestWaterObservationId,
    latestWaterSequence,
    retainedAdvancement,
    twin: acceptedTwin,
    water: acceptedWater,
    weatherSnapshot: acceptedWeatherSnapshot,
  } = useWorkflowState();
  return (
    <div>
      <span>lineage:{latestWaterObservationId ?? "none"}</span>
      <span>sequence:{latestWaterSequence}</span>
      <span>water:{acceptedWater?.water_observation_id ?? "none"}</span>
      <span>snapshot:{acceptedTwin?.snapshot_id ?? "none"}</span>
      <span>weather-target:{acceptedWeatherSnapshot?.target_date ?? "none"}</span>
      <span>retained:{retainedAdvancement?.advancement_id ?? "none"}</span>
    </div>
  );
}

function LoadNextDayWeather() {
  const dispatch = useWorkflowDispatch();
  return (
    <Button
      type="button"
      onClick={() => dispatch({
        type: "weatherSnapshotReceived",
        stateId: "state-a",
        snapshot: weatherSnapshot,
        draft: weather,
      })}
    >
      Load next-day weather
    </Button>
  );
}

describe("AdvancementPanel", () => {
  beforeEach(() => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("advancement-fixed");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requires canonical prerequisites and does not expose an arbitrary date input", () => {
    renderAdvancementPanel(fakeEndpoints(), activeState({ twin: null }));

    expect(screen.getByText("Update canonical twin state before advancing.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Advance one day" })).toBeDisabled();
    expect(screen.queryByLabelText(/date/i)).not.toBeInTheDocument();
  });

  it("submits the required next date and stable advancement ID", async () => {
    const endpoints = fakeEndpoints();
    const user = userEvent.setup();
    renderAdvancementPanel(endpoints);

    await user.click(screen.getByRole("button", { name: "Advance one day" }));

    await waitFor(() => expect(endpoints.advanceOneDay).toHaveBeenCalledTimes(1));
    expect(endpoints.advanceOneDay).toHaveBeenCalledWith(
      "state-a",
      expect.objectContaining({
        advancement_id: "advancement-fixed",
        target_date: "2026-08-01",
        weather,
        last_irrigation_event: null,
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(await screen.findByText("Advanced the canonical twin by one day.")).toBeInTheDocument();
    expect(await screen.findByText("new advancement")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("advances after reducer weather retrieval clears transient water but keeps canonical lineage", async () => {
    const endpoints = fakeEndpoints();
    const user = userEvent.setup();
    render(
      <WorkflowProvider initialState={activeState({
        weatherSnapshot: null,
        weatherDraft: null,
        weatherDate: null,
      })}>
        <StateMarker />
        <LoadNextDayWeather />
        <AdvancementPanel endpoints={endpoints} />
      </WorkflowProvider>,
    );

    expect(screen.getByText("water:water-1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load next-day weather" }));

    expect(screen.getByText("lineage:water-1")).toBeInTheDocument();
    expect(screen.getByText("sequence:1")).toBeInTheDocument();
    expect(screen.getByText("water:none")).toBeInTheDocument();
    expect(screen.getByText("snapshot:snapshot-1")).toBeInTheDocument();
    expect(screen.getByText("weather-target:2026-08-01")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Advance one day" }));

    await waitFor(() => expect(endpoints.advanceOneDay).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Advanced the canonical twin by one day.")).toBeInTheDocument();
  });

  it("reuses the same advancement ID for unchanged user-triggered retries", async () => {
    const endpoints = fakeEndpoints({ ...advancement, advancement_created: false, water_state: water });
    const user = userEvent.setup();
    renderAdvancementPanel(endpoints);

    await user.click(screen.getByRole("button", { name: "Advance one day" }));
    await waitFor(() => expect(endpoints.advanceOneDay).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Advance one day" }));
    await waitFor(() => expect(endpoints.advanceOneDay).toHaveBeenCalledTimes(2));

    expect(endpoints.advanceOneDay).toHaveBeenNthCalledWith(
      2,
      "state-a",
      expect.objectContaining({ advancement_id: "advancement-fixed" }),
      expect.anything(),
    );
  });

  it("requires explicit acknowledgement for manual next-day weather", async () => {
    const endpoints = fakeEndpoints();
    const user = userEvent.setup();
    renderAdvancementPanel(endpoints, activeState({
      weatherSnapshot: null,
      weatherDate: null,
      weatherDraft: weather,
    }));

    expect(screen.getByRole("button", { name: "Advance one day" })).toBeDisabled();
    await user.click(screen.getByLabelText(/acknowledge/i));
    await user.click(screen.getByRole("button", { name: "Advance one day" }));

    await waitFor(() => expect(endpoints.advanceOneDay).toHaveBeenCalledTimes(1));
  });

  it("allows unchanged fetched weather for the required date without acknowledgement", async () => {
    const endpoints = fakeEndpoints();
    const user = userEvent.setup();
    renderAdvancementPanel(endpoints);

    expect(screen.queryByLabelText(/acknowledge/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Advance one day" }));

    await waitFor(() => expect(endpoints.advanceOneDay).toHaveBeenCalledTimes(1));
  });

  it("requires explicit acknowledgement for edited fetched weather on the required date", async () => {
    const endpoints = fakeEndpoints();
    const user = userEvent.setup();
    renderAdvancementPanel(endpoints, activeState({
      weatherDraft: { ...weather, rainfall_mm: 2 },
    }));

    expect(screen.getByRole("button", { name: "Advance one day" })).toBeDisabled();
    await user.click(screen.getByLabelText(/acknowledge/i));
    await user.click(screen.getByRole("button", { name: "Advance one day" }));

    await waitFor(() => expect(endpoints.advanceOneDay).toHaveBeenCalledTimes(1));
  });

  it("blocks fetched weather for a different date even after manual acknowledgement would otherwise apply", async () => {
    const endpoints = fakeEndpoints();
    const user = userEvent.setup();
    renderAdvancementPanel(endpoints, activeState({
      weatherSnapshot: { ...weatherSnapshot, target_date: "2026-07-30" },
      weatherDate: "2026-07-30",
      weatherDraft: weather,
    }));

    expect(screen.getByText("Retrieve weather for 2026-08-01 before advancing.")).toBeInTheDocument();
    expect(screen.queryByLabelText(/acknowledge/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Advance one day" }));

    expect(endpoints.advanceOneDay).not.toHaveBeenCalled();
  });

  it("blocks inconsistent canonical water lineage", () => {
    renderAdvancementPanel(fakeEndpoints(), activeState({
      latestWaterObservationId: null,
      latestWaterSequence: 1,
      water: null,
    }));

    expect(screen.getByText("Canonical water lineage is incomplete; recompute water state before advancing.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Advance one day" })).toBeDisabled();
  });

  it("blocks missing canonical water sequence for an existing observation ID", () => {
    renderAdvancementPanel(fakeEndpoints(), activeState({
      latestWaterObservationId: "water-1",
      latestWaterSequence: 0,
      water: null,
    }));

    expect(screen.getByText("Canonical water lineage is incomplete; recompute water state before advancing.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Advance one day" })).toBeDisabled();
  });

  it("keeps the same advancement ID after a request failure and unchanged retry", async () => {
    const randomUUID = vi.mocked(crypto.randomUUID);
    randomUUID.mockReturnValueOnce("advancement-fixed").mockReturnValueOnce("advancement-new");
    const endpoints = {
      advanceOneDay: vi.fn()
        .mockRejectedValueOnce(new CropTwinApiError({
          kind: "api",
          status: 503,
          code: "SERVICE_UNAVAILABLE",
          message: "Temporary failure.",
          details: {},
        }))
        .mockResolvedValueOnce(advancement),
      updateTwinState: vi.fn(),
    };
    const user = userEvent.setup();
    renderAdvancementPanel(endpoints);

    await user.click(screen.getByRole("button", { name: "Advance one day" }));
    expect(await screen.findByText("Temporary failure.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Advance one day" }));

    await waitFor(() => expect(endpoints.advanceOneDay).toHaveBeenCalledTimes(2));
    expect(endpoints.advanceOneDay).toHaveBeenNthCalledWith(
      2,
      "state-a",
      expect.objectContaining({ advancement_id: "advancement-fixed" }),
      expect.anything(),
    );
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it("prevents duplicate submission while pending", async () => {
    const deferred = deferredAdvancement();
    const endpoints = {
      advanceOneDay: vi.fn().mockReturnValue(deferred.promise),
      updateTwinState: vi.fn(),
    };
    const user = userEvent.setup();
    renderAdvancementPanel(endpoints);

    await user.click(screen.getByRole("button", { name: "Advance one day" }));
    expect(screen.getByRole("button", { name: "Advancing one day" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Advancing one day" }));
    expect(endpoints.advanceOneDay).toHaveBeenCalledTimes(1);
    deferred.resolve(advancement);
    expect(await screen.findByText("new advancement")).toBeInTheDocument();
  });

  it("handles catch-up retry by refreshing the authoritative twin", async () => {
    const endpoints = fakeEndpoints({
      ...advancement,
      advancement_created: false,
      twin_state: { ...advancement.twin_state, snapshot_id: "snapshot-ledger" },
    });
    const user = userEvent.setup();
    render(
      <WorkflowProvider initialState={activeState()}>
        <StateMarker />
        <AdvancementPanel endpoints={endpoints} />
      </WorkflowProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Advance one day" }));

    expect(await screen.findByText(/refreshed the local workflow/)).toBeInTheDocument();
    expect(endpoints.updateTwinState).toHaveBeenCalledWith(
      "state-a",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.getByText("sequence:2")).toBeInTheDocument();
    expect(screen.getByText("snapshot:snapshot-authoritative")).toBeInTheDocument();
  });

  it("keeps newer water and leaves twin null when catch-up refresh fails", async () => {
    const endpoints = {
      advanceOneDay: vi.fn().mockResolvedValue({ ...advancement, advancement_created: false }),
      updateTwinState: vi.fn().mockRejectedValue(new CropTwinApiError({
        kind: "api",
        status: 409,
        code: "MISSING_CACHED_OUTPUT",
        message: "Missing cached current twin.",
        details: {},
      })),
    };
    const user = userEvent.setup();
    render(
      <WorkflowProvider initialState={activeState()}>
        <StateMarker />
        <AdvancementPanel endpoints={endpoints} />
      </WorkflowProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Advance one day" }));

    expect(await screen.findByText(/could not refresh the current twin/)).toBeInTheDocument();
    expect(screen.getByText("sequence:2")).toBeInTheDocument();
    expect(screen.getByText("snapshot:none")).toBeInTheDocument();
    expect(screen.getByText("retained:advancement-fixed")).toBeInTheDocument();
  });

  it("preserves a newer local twin on current retry", async () => {
    const endpoints = fakeEndpoints({
      ...advancement,
      advancement_created: false,
      water_state: water,
      twin_state: { ...advancement.twin_state, snapshot_id: "snapshot-ledger-old" },
    });
    const user = userEvent.setup();
    render(
      <WorkflowProvider initialState={activeState()}>
        <StateMarker />
        <AdvancementPanel endpoints={endpoints} />
      </WorkflowProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Advance one day" }));

    expect(await screen.findByText("current retry")).toBeInTheDocument();
    expect(endpoints.updateTwinState).not.toHaveBeenCalled();
    expect(screen.getByText("snapshot:snapshot-1")).toBeInTheDocument();
    expect(screen.getByText("retained:advancement-fixed")).toBeInTheDocument();
  });

  it("keeps historical retry responses technical only", async () => {
    const historical = {
      ...advancement,
      advancement_created: false,
      water_state: { ...advancedWater, water_sequence: 2 },
    };
    const endpoints = fakeEndpoints(historical);
    const user = userEvent.setup();
    render(
      <WorkflowProvider initialState={activeState({
        latestWaterObservationId: "water-3",
        latestWaterSequence: 3,
        water: { ...advancedWater, water_observation_id: "water-3", water_sequence: 3 },
      })}>
        <StateMarker />
        <AdvancementPanel endpoints={endpoints} />
      </WorkflowProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Advance one day" }));

    expect(await screen.findByText("historical retry")).toBeInTheDocument();
    expect(screen.getByText("sequence:3")).toBeInTheDocument();
    expect(screen.getByText("water:water-3")).toBeInTheDocument();
    expect(screen.getByText("snapshot:snapshot-1")).toBeInTheDocument();
  });

  it("discards stale responses and aborts on source changes", async () => {
    const deferred = deferredAdvancement();
    let signal: AbortSignal | undefined;
    const endpoints = {
      advanceOneDay: vi.fn((_stateId, _request, options?: { signal?: AbortSignal }) => {
        signal = options?.signal;
        return deferred.promise;
      }),
      updateTwinState: vi.fn(),
    };
    const user = userEvent.setup();

    function MutateWeather() {
      const dispatch = useWorkflowDispatch();
      return (
        <Button
          type="button"
          onClick={() => dispatch({
            type: "weatherDraftChanged",
            stateId: "state-a",
            draft: { ...weather, rainfall_mm: 3 },
          })}
        >
          Mutate weather
        </Button>
      );
    }

    render(
      <WorkflowProvider initialState={activeState()}>
        <StateMarker />
        <MutateWeather />
        <AdvancementPanel endpoints={endpoints} />
      </WorkflowProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Advance one day" }));
    await user.click(screen.getByRole("button", { name: "Mutate weather" }));
    expect(signal?.aborted).toBe(true);
    deferred.resolve(advancement);

    await waitFor(() => expect(screen.getByText("sequence:1")).toBeInTheDocument());
    expect(screen.queryByText("new advancement")).not.toBeInTheDocument();
  });

  it("aborts on unmount without showing caller abort as an API error", async () => {
    const deferred = deferredAdvancement();
    let signal: AbortSignal | undefined;
    const endpoints = {
      advanceOneDay: vi.fn((_stateId, _request, options?: { signal?: AbortSignal }) => {
        signal = options?.signal;
        return deferred.promise;
      }),
      updateTwinState: vi.fn(),
    };
    const user = userEvent.setup();
    const view = renderAdvancementPanel(endpoints);

    await user.click(screen.getByRole("button", { name: "Advance one day" }));
    view.unmount();

    expect(signal?.aborted).toBe(true);
  });

  it("renders structured backend errors and keeps canonical state", async () => {
    const endpoints = {
      advanceOneDay: vi.fn().mockRejectedValue(new CropTwinApiError({
        kind: "api",
        status: 409,
        code: "DAILY_ADVANCEMENT_DATE_CONFLICT",
        message: "Daily advancement target date conflict.",
        details: { expected_target_date: "2026-08-01" },
      })),
      updateTwinState: vi.fn(),
      simulateActions: vi.fn(),
      recommend: vi.fn(),
    };
    const user = userEvent.setup();
    render(
      <WorkflowProvider initialState={activeState()}>
        <StateMarker />
        <AdvancementPanel endpoints={endpoints} />
      </WorkflowProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Advance one day" }));

    expect(await screen.findByText("Daily advancement target date conflict.")).toBeInTheDocument();
    expect(screen.getByText(/DAILY_ADVANCEMENT_DATE_CONFLICT/)).toBeInTheDocument();
    expect(screen.getByText("sequence:1")).toBeInTheDocument();
    expect(endpoints.simulateActions).not.toHaveBeenCalled();
    expect(endpoints.recommend).not.toHaveBeenCalled();
  });
});
