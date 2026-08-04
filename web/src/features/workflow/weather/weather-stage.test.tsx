import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { valuesFromSnapshot, type WeatherDraft } from "./weather-draft";
import { WeatherStage } from "./weather-stage";

const { refetch, useWeatherSnapshot } = vi.hoisted(() => ({ refetch: vi.fn(), useWeatherSnapshot: vi.fn() }));
vi.mock("@/lib/api/hooks/use-workflow", () => ({ useWeatherSnapshot }));
const snapshot = { state_id: "state-1", target_date: "2026-08-04", source: "open_meteo", source_timezone: "UTC", latitude: 0, longitude: 0, tmin_c: 20, tmax_c: 30, humidity_pct: 50, wind_speed_mps: 1, wind_source_height_m: 10, wind_normalized_height_m: 2, rainfall_mm: 0, shortwave_radiation_sum_mj_m2: 10, eto_reference_feed: 2, fetched_at: "2026-08-04T00:00:00Z" } as const;
const draft: WeatherDraft = { targetDate: snapshot.target_date, provenance: "manual", values: valuesFromSnapshot(snapshot) };

describe("WeatherStage explicit retrieval", () => {
  beforeEach(() => { vi.clearAllMocks(); refetch.mockResolvedValue({ data: snapshot }); useWeatherSnapshot.mockReturnValue({ data: undefined, isFetching: false, isError: false, refetch }); });
  it("does not fetch on mount or date edit", () => { render(<WeatherStage stateId="state-1" draft={draft} onDraftChange={vi.fn()} onAccept={vi.fn()} />); expect(refetch).not.toHaveBeenCalled(); fireEvent.change(screen.getByLabelText("Target date"), { target: { value: "2026-08-05" } }); expect(refetch).not.toHaveBeenCalled(); expect(useWeatherSnapshot).toHaveBeenCalledWith("state-1", "2026-08-04"); });
  it("fetches only after the explicit action", () => { render(<WeatherStage stateId="state-1" draft={draft} onDraftChange={vi.fn()} onAccept={vi.fn()} />); fireEvent.click(screen.getByRole("button", { name: "Retrieve weather" })); expect(refetch).toHaveBeenCalledTimes(1); });
});
