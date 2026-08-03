import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActiveCycleWorkspace } from "./active-cycle-workspace";

let sessionState: Record<string, unknown>;
vi.mock("@/lib/api/hooks/use-sessions", () => ({ useSession: () => sessionState }));
vi.mock("@/lib/api/hooks/use-plots", () => ({ usePlot: () => ({ data: undefined }) }));

const base = { state_id: "state-1", crop_type: "tomato", planting_date: "2026-08-01", location: { name: "Field", latitude: 17, longitude: 78 }, soil_texture: "loam" };
const current = { crop_type: "tomato", growth_stage: "initial", days_since_planting: 2, predicted_label: "healthy", disease_category: "none", confidence_calibrated: 1, uncertainty_score: 0, uncertainty_band: "low", eto_computed: 1, eto_method: "penman_monteith", kc: 1, etc: 1, taw: 1, raw_threshold: 1, raw_root_zone_depletion_mm: 1, root_zone_depletion_mm: 1, root_zone_depletion: 1, water_surplus_mm: 0, depletion_beyond_taw_mm: 0, estimated_moisture_state: "adequate", stress_band: "low", observed_at: "now", computed_at: "now", observation_time_basis: "EXPLICIT", last_update_time: "now" };

describe("ActiveCycleWorkspace", () => {
  beforeEach(() => { sessionState = { isLoading: false, isError: false, data: { ...base, created_at: "now" } }; });
  it("shows a normal empty state when current state is absent", () => { render(<ActiveCycleWorkspace stateId="state-1" standalone />); expect(screen.getByText("Current twin state not yet computed")).toBeVisible(); expect(screen.getByText("Standalone session")).toBeVisible(); });
  it("labels current state as deterministic and authoritative", () => { sessionState.data = { ...base, current_state: current }; render(<ActiveCycleWorkspace stateId="state-1" />); expect(screen.getByText(/Deterministic authoritative backend state/i)).toBeVisible(); expect(screen.getByText("Current twin state")).toBeVisible(); expect(screen.getByText("state-1")).toBeVisible(); });
});
