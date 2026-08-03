import { afterEach, describe, expect, it, vi } from "vitest";
import { createCropCycle, createFarm, createPlot, createSession, getSession } from "./operations";

const farm = { farm_id: "farm-1", name: "Farm", created_at: "2026-08-03T00:00:00Z", updated_at: "2026-08-03T00:00:00Z" };
const plot = { plot_id: "plot-1", farm_id: "farm-1", name: "Plot", location: { name: "Field", latitude: 17, longitude: 78 }, soil_texture: "loam", created_at: "2026-08-03T00:00:00Z", updated_at: "2026-08-03T00:00:00Z" };
const session = { state_id: "state-1", crop_type: "tomato", planting_date: "2026-08-01", location: plot.location, soil_texture: "loam", created_at: "2026-08-03T00:00:00Z" };

afterEach(() => vi.unstubAllGlobals());
function respond(payload: unknown) { const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } }))); vi.stubGlobal("fetch", fetchMock); return fetchMock; }

describe("Milestone 2 API operations", () => {
  it("uses exact farm and plot paths and bodies", async () => {
    const fetchMock = respond(farm); await createFarm({ name: "Farm" });
    expect(fetchMock).toHaveBeenLastCalledWith("http://127.0.0.1:8000/farms", expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Farm" }) }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(plot), { status: 200 }));
    await createPlot("farm/one", { name: "Plot", location: plot.location, soil_texture: "loam" });
    expect(fetchMock).toHaveBeenLastCalledWith("http://127.0.0.1:8000/farms/farm%2Fone/plots", expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Plot", location: plot.location, soil_texture: "loam" }) }));
  });

  it("uses exact standalone and plot-backed session contracts", async () => {
    const fetchMock = respond(session);
    await createSession({ crop_type: "tomato", planting_date: "2026-08-01", location: plot.location, soil_texture: "loam" });
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ crop_type: "tomato", planting_date: "2026-08-01", location: plot.location, soil_texture: "loam" });
    await createCropCycle("plot/one", { crop_type: "tomato", planting_date: "2026-08-01" });
    expect(fetchMock).toHaveBeenLastCalledWith("http://127.0.0.1:8000/plots/plot%2Fone/crop-cycles", expect.objectContaining({ method: "POST", body: JSON.stringify({ crop_type: "tomato", planting_date: "2026-08-01" }) }));
  });

  it("encodes an existing session ID", async () => {
    const loaded = { ...session, current_state: { crop_type: "tomato", growth_stage: "initial", days_since_planting: 2, predicted_label: "healthy", disease_category: "none", confidence_calibrated: 1, uncertainty_score: 0, uncertainty_band: "low", eto_computed: 1, eto_method: "penman_monteith", kc: 1, etc: 1, taw: 1, raw_threshold: 1, raw_root_zone_depletion_mm: 1, root_zone_depletion_mm: 1, root_zone_depletion: 1, water_surplus_mm: 0, depletion_beyond_taw_mm: 0, estimated_moisture_state: "adequate", stress_band: "low", observed_at: "2026-08-03T00:00:00Z", computed_at: "2026-08-03T00:00:00Z", observation_time_basis: "EXPLICIT", last_update_time: "2026-08-03T00:00:00Z" } };
    delete (loaded as Partial<typeof session>).created_at;
    const fetchMock = respond(loaded); await getSession("state/one");
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8000/sessions/state%2Fone");
  });
});
