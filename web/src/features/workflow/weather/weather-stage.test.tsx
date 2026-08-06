import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CropTwinApiError } from "@/lib/api/errors";
import type { WeatherSnapshot } from "@/lib/api/contracts";
import { acceptedWeatherFromDraft, valuesFromSnapshot, type AcceptedWeather, type WeatherDraft } from "./weather-draft";
import { WeatherStage } from "./weather-stage";

const { cancel, refetch, useWeatherSnapshot } = vi.hoisted(() => ({ cancel: vi.fn(), refetch: vi.fn(), useWeatherSnapshot: vi.fn() }));
vi.mock("@/lib/api/hooks/use-workflow", () => ({ useWeatherSnapshot }));

const snapshot: WeatherSnapshot = { state_id: "state-1", target_date: "2026-08-04", source: "open_meteo", source_timezone: "UTC", latitude: 0, longitude: 0, tmin_c: 20, tmax_c: 30, humidity_pct: 50, wind_speed_mps: 1, wind_source_height_m: 10, wind_normalized_height_m: 2, rainfall_mm: 0, shortwave_radiation_sum_mj_m2: 10, eto_reference_feed: 2, fetched_at: "2026-08-04T00:00:00Z" };
const draft: WeatherDraft = { targetDate: snapshot.target_date, provenance: "manual", values: valuesFromSnapshot(snapshot) };
let hookData: typeof snapshot | undefined;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function renderControlled(initial = draft, accepted?: AcceptedWeather) {
  const changes: WeatherDraft[] = [];
  const onAccept = vi.fn();
  function Harness() {
    const [value, setValue] = useState(initial);
    return <WeatherStage stateId="state-1" draft={value} accepted={accepted} onDraftChange={(next) => { changes.push(next); setValue(next); }} onAccept={onAccept} />;
  }
  return { changes, onAccept, ...render(<Harness />) };
}

describe("WeatherStage request identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookData = undefined;
    cancel.mockResolvedValue(undefined);
    refetch.mockResolvedValue({ data: snapshot, error: null });
    useWeatherSnapshot.mockImplementation(() => ({ data: hookData, isFetching: false, isError: false, error: null, refetch, cancel }));
  });

  it("does not fetch on mount or date edit", () => {
    renderControlled();
    expect(refetch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Target date"), { target: { value: "2026-08-05" } });
    expect(refetch).not.toHaveBeenCalled();
    expect(useWeatherSnapshot).toHaveBeenCalledWith("state-1", "2026-08-04");
  });

  it("fetches only after the explicit action", () => {
    renderControlled();
    fireEvent.click(screen.getByRole("button", { name: "Retrieve weather" }));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledWith({ cancelRefetch: true });
  });

  it("does not apply an old response after its target date changes", async () => {
    const pending = deferred<{ data: typeof snapshot; error: null }>();
    refetch.mockReturnValue(pending.promise);
    renderControlled();
    fireEvent.click(screen.getByRole("button", { name: "Retrieve weather" }));
    fireEvent.change(screen.getByLabelText("Target date"), { target: { value: "2026-08-05" } });
    hookData = snapshot;
    await act(async () => pending.resolve({ data: snapshot, error: null }));
    expect(screen.getByLabelText("Target date")).toHaveValue("2026-08-05");
    expect(screen.getByLabelText("Review provenance")).toHaveValue("manual");
  });

  it("preserves a field edited while retrieval is pending", async () => {
    const pending = deferred<{ data: typeof snapshot; error: null }>();
    refetch.mockReturnValue(pending.promise);
    renderControlled();
    fireEvent.click(screen.getByRole("button", { name: "Retrieve weather" }));
    fireEvent.change(screen.getByLabelText("Minimum temperature (°C)"), { target: { value: "17" } });
    hookData = snapshot;
    await act(async () => pending.resolve({ data: snapshot, error: null }));
    expect(screen.getByLabelText("Minimum temperature (°C)")).toHaveValue(17);
    expect(screen.getByLabelText("Review provenance")).toHaveValue("manual");
  });

  it("does not restore fetched provenance after switching to manual during retrieval", async () => {
    hookData = snapshot;
    const fetchedDraft: WeatherDraft = { targetDate: snapshot.target_date, provenance: "fetched_reviewed", values: valuesFromSnapshot(snapshot), fetchedIdentity: { stateId: snapshot.state_id, targetDate: snapshot.target_date, fetchedAt: snapshot.fetched_at } };
    const pending = deferred<{ data: typeof snapshot; error: null }>();
    refetch.mockReturnValue(pending.promise);
    renderControlled(fetchedDraft);
    fireEvent.click(screen.getByRole("button", { name: "Retrieve weather" }));
    fireEvent.change(screen.getByLabelText("Review provenance"), { target: { value: "manual" } });
    await act(async () => pending.resolve({ data: snapshot, error: null }));
    expect(screen.getByLabelText("Review provenance")).toHaveValue("manual");
    expect(screen.getByText("Fully manual weather")).toBeVisible();
  });

  it("allows only the latest of two retrievals to populate the draft", async () => {
    const first = deferred<{ data: typeof snapshot; error: null }>();
    const second = deferred<{ data: typeof snapshot; error: null }>();
    const newer: WeatherSnapshot = { ...snapshot, tmin_c: 22, fetched_at: "2026-08-04T01:00:00Z" };
    refetch.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { changes } = renderControlled();
    fireEvent.click(screen.getByRole("button", { name: "Retrieve weather" }));
    fireEvent.click(screen.getByRole("button", { name: "Retrieve weather" }));
    await act(async () => first.resolve({ data: snapshot, error: null }));
    expect(changes).toHaveLength(0);
    hookData = newer;
    await act(async () => second.resolve({ data: newer, error: null }));
    await waitFor(() => expect(screen.getByLabelText("Minimum temperature (°C)")).toHaveValue(22));
    expect(changes).toHaveLength(1);
  });

  it("does not display an error from a superseded request", async () => {
    const pending = deferred<{ data: undefined; error: CropTwinApiError }>();
    refetch.mockReturnValue(pending.promise);
    renderControlled();
    fireEvent.click(screen.getByRole("button", { name: "Retrieve weather" }));
    fireEvent.change(screen.getByLabelText("Rainfall (mm)"), { target: { value: "4" } });
    await act(async () => pending.resolve({ data: undefined, error: new CropTwinApiError({ kind: "backend", code: "WEATHER_LOOKUP_FAILED", message: "old failure" }) }));
    expect(screen.queryByText("Weather unavailable")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Rainfall (mm)")).toHaveValue(4);
  });

  it("does not apply responses for another date or state", async () => {
    const otherDate = { ...snapshot, target_date: "2026-08-05" } as const;
    const otherState = { ...snapshot, state_id: "state-2" } as const;
    refetch.mockResolvedValueOnce({ data: otherDate, error: null }).mockResolvedValueOnce({ data: otherState, error: null });
    const { changes } = renderControlled();
    fireEvent.click(screen.getByRole("button", { name: "Retrieve weather" }));
    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
    expect(changes).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Retrieve weather" }));
    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(2));
    expect(changes).toHaveLength(0);
  });

  it("never changes accepted weather without explicit acceptance", async () => {
    const accepted = acceptedWeatherFromDraft("state-1", draft);
    const pending = deferred<{ data: typeof snapshot; error: null }>();
    refetch.mockReturnValue(pending.promise);
    const { onAccept } = renderControlled(draft, accepted);
    fireEvent.click(screen.getByRole("button", { name: "Retrieve weather" }));
    fireEvent.change(screen.getByLabelText("Rainfall (mm)"), { target: { value: "3" } });
    await act(async () => pending.resolve({ data: snapshot, error: null }));
    expect(onAccept).not.toHaveBeenCalled();
  });
});
