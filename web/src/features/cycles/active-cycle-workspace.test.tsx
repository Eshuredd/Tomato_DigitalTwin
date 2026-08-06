import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActiveCycleWorkspace } from "./active-cycle-workspace";

let sessionState: Record<string, unknown>;
let plotState: Record<string, unknown>;
vi.mock("@/lib/api/hooks/use-sessions", () => ({
  useSession: () => sessionState,
}));
vi.mock("@/lib/api/hooks/use-plots", () => ({
  usePlot: () => plotState,
}));

const base = {
  state_id: "state-1",
  crop_type: "tomato",
  planting_date: "2026-08-01",
  location: { name: "Session field", latitude: 17, longitude: 78 },
  soil_texture: "loam",
};
const current = {
  crop_type: "tomato",
  growth_stage: "initial",
  days_since_planting: 2,
  predicted_label: "healthy",
  disease_category: "none",
  confidence_calibrated: 1,
  uncertainty_score: 0,
  uncertainty_band: "low",
  eto_computed: 1,
  eto_method: "penman_monteith",
  kc: 1,
  etc: 1,
  taw: 1,
  raw_threshold: 1,
  raw_root_zone_depletion_mm: 1,
  root_zone_depletion_mm: 1,
  root_zone_depletion: 1,
  water_surplus_mm: 0,
  depletion_beyond_taw_mm: 0,
  estimated_moisture_state: "adequate",
  stress_band: "low",
  observed_at: "now",
  computed_at: "now",
  observation_time_basis: "EXPLICIT",
  last_update_time: "now",
};

describe("ActiveCycleWorkspace provenance", () => {
  beforeEach(() => {
    sessionState = {
      isLoading: false,
      isError: false,
      data: { ...base, created_at: "now" },
    };
    plotState = { isLoading: false, isError: false, data: undefined };
  });

  it("makes no relationship claim when the URL has no relationship hint", () => {
    render(<ActiveCycleWorkspace stateId="state-1" />);
    expect(screen.getByText("Current twin state not yet computed")).toBeVisible();
    expect(screen.queryByText(/standalone session/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/plot-backed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/relationship not asserted/i)).not.toBeInTheDocument();
  });

  it("labels standalone mode as navigation context, not session provenance", () => {
    render(<ActiveCycleWorkspace stateId="state-1" standalone />);
    expect(
      screen.getByText("Opened from standalone creation flow"),
    ).toBeVisible();
    expect(screen.getByText(/Navigation context only/)).toBeVisible();
    expect(screen.queryByText("Standalone session")).not.toBeInTheDocument();
  });

  it("keeps a valid plot hint outside the authoritative session summary", () => {
    plotState.data = { plot_id: "plot-1", name: "North Plot" };
    render(<ActiveCycleWorkspace stateId="state-1" plotId="plot-1" />);

    const authoritative = screen
      .getByText("Authoritative session summary")
      .closest("section, article, div");
    expect(screen.getByText("Opened from plot: North Plot")).toBeVisible();
    expect(screen.getByText(/does not expose durable farm or plot/i)).toBeVisible();
    expect(screen.queryByText(/plot-backed/i)).not.toBeInTheDocument();
    expect(authoritative).not.toBeNull();
    expect(
      within(authoritative as HTMLElement).queryByText("North Plot"),
    ).not.toBeInTheDocument();
  });

  it("keeps the session available when an edited plot hint is invalid", () => {
    plotState = { isLoading: false, isError: true, error: new Error("missing") };
    render(<ActiveCycleWorkspace stateId="state-1" plotId="edited-plot" />);
    expect(screen.getByText("Plot navigation context unavailable")).toBeVisible();
    expect(screen.getByText("state-1")).toBeVisible();
    expect(screen.getByText("Session field")).toBeVisible();
  });

  it("renders authoritative values only from the session response", () => {
    sessionState.data = { ...base, current_state: current };
    plotState.data = {
      plot_id: "plot-2",
      name: "Edited URL Plot",
      location: { name: "Wrong field", latitude: 0, longitude: 0 },
    };
    render(<ActiveCycleWorkspace stateId="state-1" plotId="plot-2" />);
    expect(screen.getByText(/Deterministic authoritative backend state/i)).toBeVisible();
    expect(screen.getByText("Session field")).toBeVisible();
    expect(screen.queryByText("Wrong field")).not.toBeInTheDocument();
  });
});
